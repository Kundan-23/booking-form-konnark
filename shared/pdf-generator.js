/**
 * Konnark PDF Generator — pdfmake Edition
 * Pixel-perfect declarative PDF matching the original printed booking form.
 * No html2canvas / screenshot capture. Uses pdfmake native drawing API.
 *
 * Layout reference: stellar_page_1.png – stellar_page_5.png
 */

const KonnarkPDF = (function () {

  // Dynamic font loader — loads Google Inter font TTF into pdfMake.vfs for exact matching typography
  let isFontLoaded = false;
  async function loadInterFont() {
    if (isFontLoaded || (typeof pdfMake !== 'undefined' && pdfMake.vfs && pdfMake.vfs['Inter-Regular.ttf'])) {
      isFontLoaded = true;
      return true;
    }
    try {
      const [regRes, boldRes] = await Promise.all([
        fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'),
        fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf')
      ]);
      if (!regRes.ok || !boldRes.ok) return false;

      const [regBuf, boldBuf] = await Promise.all([regRes.arrayBuffer(), boldRes.arrayBuffer()]);

      const arrayBufferToBase64 = (buffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
      };

      if (!pdfMake.vfs) pdfMake.vfs = {};
      pdfMake.vfs['Inter-Regular.ttf'] = arrayBufferToBase64(regBuf);
      pdfMake.vfs['Inter-Bold.ttf'] = arrayBufferToBase64(boldBuf);

      pdfMake.fonts = {
        ...pdfMake.fonts,
        Inter: {
          normal: 'Inter-Regular.ttf',
          bold: 'Inter-Bold.ttf',
          italics: 'Inter-Regular.ttf',
          bolditalics: 'Inter-Bold.ttf'
        }
      };
      isFontLoaded = true;
      return true;
    } catch (e) {
      console.warn('Custom font load fallback to Roboto:', e);
      return false;
    }
  }

  // Dynamic logo watermark loader — loads logo from shared/logo.png or window._konnarkLogoBase64
  let logoBase64 = null;
  async function loadLogoBase64() {
    if (logoBase64) return logoBase64;
    const paths = ['/shared/logo.png', '../shared/logo.png', 'shared/logo.png', '/shared/logo.jpg', '../shared/logo.jpg', 'shared/logo.jpg'];
    for (const p of paths) {
      try {
        const res = await fetch(`${p}?v=${Date.now()}`);
        if (res && res.ok) {
          const blob = await res.blob();
          logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          if (logoBase64) {
            window._konnarkLogoBase64 = logoBase64;
            console.log('[KonnarkPDF] Fresh logo loaded from:', p);
            return logoBase64;
          }
        }
      } catch (e) {}
    }
    return window._konnarkLogoBase64 || null;
  }

  // ── Helpers ────────────────────────────────────────────────
  function fv(val) {
    return (val !== null && val !== undefined && val !== '') ? String(val) : '';
  }

  function chkd(data, key, value) {
    if (!data || !key) return false;
    const v = data[key];
    if (v === undefined || v === null || v === false) return false;
    if (v === true) return true;
    
    const target = String(value).trim().toLowerCase();
    
    if (Array.isArray(v)) {
      return v.some(item => {
        const s = String(item).trim().toLowerCase();
        return s === target || (s === 'nri' && target.includes('non-resident indian')) || (target === 'nri' && s.includes('non-resident indian'));
      });
    }
    
    const strV = String(v).trim().toLowerCase();
    return strV === target || (strV === 'nri' && target.includes('non-resident indian')) || (target === 'nri' && strV.includes('non-resident indian'));
  }

  // Bulletproof table-based vector checkbox — empty bordered box when false, navy fill + white 'X' when true
  function box(checked) {
    return {
      table: {
        widths: [10],
        body: [[
          {
            text: checked ? 'X' : '',
            fontSize: 7,
            bold: true,
            alignment: 'center',
            fillColor: checked ? '#1C2B4A' : null,
            color: '#ffffff',
            margin: [0, -0.5, 0, 0]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => '#000000',
        vLineColor: () => '#000000',
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 1, 4, 0]
    };
  }

  function fdate(str) {
    if (!str) return '';
    try {
      const d = new Date(str);
      if (isNaN(d)) return str;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch (e) { return str; }
  }

  // ── Layout primitives ──────────────────────────────────────

  /** Standard labeled field: label text + underlined value on same row */
  function field(label, value, valueWidth) {
    valueWidth = valueWidth || '*';
    return {
      table: {
        widths: ['auto', valueWidth],
        body: [[
          {
            text: label,
            style: 'fieldLabel',
            border: [false, false, false, false],
            margin: [0, 0, 4, 0]
          },
          {
            text: fv(value),
            style: 'fieldValue',
            border: [false, false, false, true]
          }
        ]]
      },
      layout: fieldLayout(),
      margin: [0, 0, 0, 3]
    };
  }

  /** Field with explicit label + value widths */
  function fieldW(label, value, labelW, valueW) {
    return {
      table: {
        widths: [labelW, valueW],
        body: [[
          { text: label, style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(value), style: 'fieldValue', border: [false,false,false,true] }
        ]]
      },
      layout: fieldLayout(),
      margin: [0, 0, 0, 3]
    };
  }

  /** Shared table layout for underlined fields */
  function fieldLayout() {
    return {
      hLineWidth: (i, node) => i === node.table.body.length ? 0.5 : 0,
      hLineColor: () => '#000',
      vLineWidth: () => 0,
      paddingLeft: () => 2,
      paddingRight: () => 2,
      paddingTop: () => 3,    // push text DOWN toward the underline
      paddingBottom: () => 1  // tight gap between text baseline and border
    };
  }

  /** Navy "BOOKING FORM" header bar — used at top of pages 2-5 */
  function pageHeader() {
    return {
      table: {
        widths: ['*'],
        body: [[{
          text: 'BOOKING FORM',
          style: 'pageHeader',
          border: [false, false, false, false],
          fillColor: '#1C2B4A',
          margin: [0, 7, 0, 7]
        }]]
      },
      layout: 'noBorders',
      margin: [-32, 0, -32, 6]   // bleed left/right only — NO negative top (prevents bleed to prev page)
    };
  }

  /** Sub-header italic instruction */
  function pageSubHeader() {
    return {
      text: 'Please use CAPITAL LETTERS only for filling the details below',
      style: 'pageSubHeader',
      margin: [0, 0, 0, 8]
    };
  }

  /** Bold section heading with navy underline */
  function sectionHead(num, title) {
    return {
      stack: [
        {
          text: `${num}. ${title}`,
          style: 'sectionHead'
        },
        {
          canvas: [{
            type: 'line', x1: 0, y1: 0,
            x2: 530, y2: 0,
            lineWidth: 1.5, lineColor: '#1C2B4A'
          }]
        }
      ],
      margin: [0, 6, 0, 4]
    };
  }

  /** Smaller bold sub-section label */
  function subHead(text) {
    return { text, style: 'subHead', margin: [0, 5, 0, 2] };
  }

  /** Single-row checkbox group */
  function checkRow(items, data, key, gap) {
    return {
      columns: items.map(item => ({
        width: 'auto',
        columns: [
          box(chkd(data, key, item)),
          { text: item, style: 'checkLabel', width: 'auto' }
        ],
        columnGap: 4
      })),
      columnGap: gap || 14,
      margin: [0, 2, 0, 6]
    };
  }

  /**
   * Applicant name row — column headers (Title | Name | DOB | Anniversary)
   * followed by a single underlined row with // dividers, matching reference.
   * Title cell shows selected title OR 'Mr./Ms./Mrs.' placeholder — never both.
   */
  function applicantNameRow(data, titleKey, nameKey, dobKey, annivKey) {
    // Show selected title only — fallback to 'Mr./Ms./Mrs.' if nothing selected
    const titleDisplay = fv(data[titleKey]) || 'Mr./Ms./Mrs.';

    // Column header widths: [Title, Name, DOB, (Anniversary)]
    const colWidths = annivKey ? [70, '*', 90, 95] : [70, '*', 95];
    const headers   = annivKey
      ? ['Title', 'Name', 'DOB', 'Anniversary Date']
      : ['Title', 'Name', 'DOB'];

    // Value cells — single underlined row
    const valueCells = [
      {
        text: titleDisplay,
        style: 'fieldValue',
        border: [false, false, false, true]
      },
      {
        // Name with // separator before DOB
        columns: [
          { text: fv(data[nameKey]), style: 'fieldValue', width: '*' },
          { text: '  //', style: 'fieldLabel', width: 'auto', margin: [0, 0, 2, 0] }
        ],
        border: [false, false, false, true]
      },
      annivKey
        ? {
          // DOB with // separator before Anniversary
          columns: [
            { text: fdate(data[dobKey]) || '', style: 'fieldValue', width: '*' },
            { text: '  //', style: 'fieldLabel', width: 'auto', margin: [0, 0, 2, 0] }
          ],
          border: [false, false, false, true]
        }
        : {
          text: fdate(data[dobKey]) || '',
          style: 'fieldValue',
          border: [false, false, false, true]
        }
    ];

    if (annivKey) {
      valueCells.push({
        text: fdate(data[annivKey]) || '',
        style: 'fieldValue',
        border: [false, false, false, true]
      });
    }

    return [
      // Header row
      {
        table: {
          widths: colWidths,
          body: [[ ...headers.map(h => ({ text: h, style: 'colHeader', border: [false,false,false,false] })) ]]
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 1]
      },
      // Value row
      {
        table: {
          widths: colWidths,
          body: [valueCells]
        },
        layout: fieldLayout(),
        margin: [0, 0, 0, 5]
      }
    ];
  }

  /** City / State / PIN on one row */
  function cityStatePinRow(city, state, pin) {
    return {
      table: {
        widths: ['auto', '*', 'auto', '*', 'auto', 70],
        body: [[
          { text: 'City:', style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(city),  style: 'fieldValue', border: [false,false,false,true] },
          { text: 'State:',    style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(state), style: 'fieldValue', border: [false,false,false,true] },
          { text: 'PIN Code:', style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(pin),   style: 'fieldValue', border: [false,false,false,true] }
        ]]
      },
      layout: fieldLayout(),
      margin: [0, 0, 0, 4]
    };
  }

  /** Single signature line with label below */
  function sigBlock(label) {
    return {
      stack: [
        {
          canvas: [{
            type: 'line',
            x1: 0, y1: 25,
            x2: 140, y2: 25,
            lineWidth: 0.5, lineColor: '#000'
          }]
        },
        { text: label, style: 'sigLabel', alignment: 'center', margin: [0, 2, 0, 0] }
      ],
      width: 140
    };
  }

  // ── PAGE 1: Cover ──────────────────────────────────────────
  function buildPage1(data, cfg, logoData) {
    const formDate = fdate(data['form-date']);

    // Brand section with logo emblem on left + text on right (matching reference screenshot)
    const brandSection = logoData ? {
      columns: [
        { width: '*', text: '' }, // left spacer
        {
          width: 'auto',
          columns: [
            { image: logoData, width: 110, margin: [0, 0, 16, 0] },
            {
              width: 'auto',
              stack: [
                { text: 'K O N N A R K', style: 'coverKonnark', alignment: 'left', margin: [0, 8, 0, 4] },
                { text: cfg.projectTitle, style: 'coverProject', alignment: 'left' }
              ]
            }
          ]
        },
        { width: '*', text: '' } // right spacer
      ],
      margin: [0, 100, 0, 60]
    } : {
      stack: [
        { text: 'K O N N A R K', style: 'coverKonnark' },
        { text: cfg.projectTitle, style: 'coverProject', margin: [0, 6, 0, 70] }
      ],
      margin: [0, 120, 0, 0]
    };

    return [
      // Top navy bar
      {
        canvas: [{ type: 'rect', x: -32, y: -32, w: 600, h: 22, color: '#1C2B4A' }],
        absolutePosition: { x: 0, y: 0 }
      },
      // Form No + Date
      {
        columns: [
          {
            text: [
              { text: 'Form No. ', style: 'metaLabel' },
              {
                text: fv(data.formNo),
                style: 'metaValue',
                decoration: 'underline'
              }
            ]
          },
          {
            text: [
              { text: 'Date: ', style: 'metaLabel' },
              {
                text: formDate || '',
                style: 'metaValue',
                decoration: 'underline'
              }
            ],
            alignment: 'right'
          }
        ],
        margin: [0, 30, 0, 0]
      },
      brandSection,
      // BOOKING FORM badge
      {
        table: {
          widths: ['*'],
          body: [[{
            text: 'BOOKING FORM',
            style: 'coverBadge',
            fillColor: '#1C2B4A',
            border: [false, false, false, false],
            margin: [0, 8, 0, 8]
          }]]
        },
        layout: 'noBorders',
        margin: [60, 0, 60, 0]
      },
      // MahaRERA footer (absolute bottom)
      {
        text: [
          { text: 'This project is registered with Maharashtra Real Estate Regulatory Authority with\n' },
          { text: `MahaRERA Registration Number ` },
          { text: cfg.rera, bold: true },
          { text: ' and is available on the website - maharera.mahaonline.gov.in | *T&C Apply' }
        ],
        style: 'coverFooter',
        absolutePosition: { x: 30, y: 755 },
        alignment: 'center'
      }
    ];
  }

  // ── PAGE 2: Applicant Details ──────────────────────────────
  function buildPage2(data) {
    const commSame = data['comm-same-as-perm'] === 'true' || data['comm-same-as-perm'] === true;
    const cHouse    = commSame ? fv(data['primary-house'])    : fv(data['comm-house']);
    const cStreet   = commSame ? fv(data['primary-street'])   : fv(data['comm-street']);
    const cLocality = commSame ? fv(data['primary-locality']) : fv(data['comm-locality']);
    const cCity     = commSame ? fv(data['primary-city'])     : fv(data['comm-city']);
    const cState    = commSame ? fv(data['primary-state'])    : fv(data['comm-state']);
    const cPin      = commSame ? fv(data['primary-pin'])      : fv(data['comm-pin']);

    return [
      // ── Force new page before applicant details ──
      { text: '', pageBreak: 'before' },
      pageHeader(),
      pageSubHeader(),
      sectionHead('1', 'DETAILS OF APPLICANTS'),
      subHead('Primary Applicant'),
      {
        text: '(Please use CAPITAL LETTERS only. Leave one space between First, Middle & Last name.)',
        style: 'smallNote',
        margin: [0, -2, 0, 4]
      },
      ...applicantNameRow(data, 'primary-title', 'primary-name', 'primary-dob', 'primary-anniversary'),
      checkRow(['Mumbai Resident', 'Non-Mumbai Resident', 'Non-Resident Indian'], data, 'primary-residency', 12),
      subHead('Permanent Address'),
      field('House No. & Building:', data['primary-house']),
      field('Street Name:', data['primary-street']),
      field('Locality/Landmark:', data['primary-locality']),
      cityStatePinRow(data['primary-city'], data['primary-state'], data['primary-pin']),
      fieldW('Aadhar No.:', data['primary-aadhaar'], 'auto', 140),
      fieldW('Mobile No.:', data['primary-mobile'], 'auto', 140),
      fieldW('Email ID:', data['primary-email'], 'auto', 160),
      subHead('Communication Address (if different)'),
      field('House No. & Building:', cHouse),
      field('Street Name:', cStreet),
      field('Locality/Landmark:', cLocality),
      cityStatePinRow(cCity, cState, cPin),
      subHead('Co-Applicant 1'),
      ...applicantNameRow(data, 'co1-title', 'co1-name', 'co1-dob', null),
      checkRow(['Mumbai Resident', 'Non-Mumbai Resident', 'Non-Resident Indian'], data, 'co1-residency', 12),
      fieldW('Aadhar No.:', data['co1-aadhaar'], 'auto', 140),
      fieldW('Mobile No.:', data['co1-mobile'], 'auto', 140),
      fieldW('Email ID:', data['co1-email'], 'auto', 160),
      subHead('Co-Applicant 2'),
      ...applicantNameRow(data, 'co2-title', 'co2-name', 'co2-dob', null),
      checkRow(['Mumbai Resident', 'Non-Mumbai Resident', 'Non-Resident Indian'], data, 'co2-residency', 12),
      fieldW('Aadhar No.:', data['co2-aadhaar'], 'auto', 140),
      fieldW('Mobile No.:', data['co2-mobile'], 'auto', 140),
      fieldW('Email ID:', data['co2-email'], 'auto', 160),
    ];
  }

  // ── PAGE 3: Application + Payment Details ──────────────────
  function buildPage3(data, cfg) {
    const typs    = Array.isArray(data['typology']) ? data['typology'] : (data['typology'] ? [data['typology']] : []);
    const bank    = cfg.promoterBank;
    const payDate = fdate(data['payment-date']);

    // Flat No / Wing / Floor in one row
    const appDetailRow = {
      table: {
        widths: ['auto', 80, 'auto', 80, 'auto', 90],
        body: [[
          { text: 'Flat No.:', style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(data['flat-no']), style: 'fieldValue', border: [false,false,false,true] },
          { text: 'Wing:', style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(data['wing']), style: 'fieldValue', border: [false,false,false,true] },
          { text: 'Floor.:', style: 'fieldLabel', border: [false,false,false,false], margin:[0,0,4,0] },
          { text: fv(data['floor']), style: 'fieldValue', border: [false,false,false,true] }
        ]]
      },
      layout: fieldLayout(),
      margin: [0, 0, 0, 5]
    };

    // Typology row
    const typRow = {
      columns: [
        { text: 'Typology:', style: 'fieldLabel', width: 'auto', margin: [0, 3, 8, 0] },
        {
          columns: cfg.typologyOptions.map(o => ({
            width: 'auto',
            columns: [
              box(typs.includes(o)),
              { text: o, style: 'checkLabel', width: 'auto' }
            ],
            columnGap: 4
          })),
          columnGap: 12
        }
      ],
      margin: [0, 1, 0, 3]
    };

    // Employment Type row
    const empRow = {
      columns: [
        { text: 'Employment Type:', style: 'fieldLabel', width: 'auto', margin: [0, 3, 8, 0] },
        {
          columns: [
            { width: 'auto', columns: [box(chkd(data,'employment-type','Salaried')), { text:'Salaried', style:'checkLabel', width:'auto' }], columnGap:4 },
            { width: 'auto', columns: [box(chkd(data,'employment-type','Self-Employed')), { text:'Self-Employed', style:'checkLabel', width:'auto' }], columnGap:4 }
          ],
          columnGap: 12,
          width: 'auto'
        },
        fieldW('Designation:', data['designation'], 'auto', 100)
      ],
      columnGap: 10,
      margin: [0, 1, 0, 3]
    };

    return [
      { text: '', pageBreak: 'before' },
      pageHeader(),
      pageSubHeader(),
      sectionHead('2', 'APPLICATION DETAILS'),
      appDetailRow,
      typRow,
      sectionHead('3', 'TYPE OF APPLICANT'),
      {
        columns: [
          { width:'auto', columns:[box(chkd(data,'entity-type','Individual')),{ text:'Individual',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'entity-type','Partnership')),{ text:'Partnership',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'entity-type','HUF')),{ text:'HUF',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'entity-type','Proprietorship')),{ text:'Proprietorship',style:'checkLabel',width:'auto'}],columnGap:4}
        ],
        columnGap: 12,
        margin: [0, 1, 0, 3]
      },
      {
        columns: [
          { width:'auto', columns:[box(chkd(data,'entity-type','Private Ltd. Co.')),{ text:'Private Ltd. Co.',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'entity-type','Public Ltd. Co.')),{ text:'Public Ltd. Co.',style:'checkLabel',width:'auto'}],columnGap:4}
        ],
        columnGap: 12,
        margin: [0, 0, 0, 3]
      },
      empRow,
      field('Office Address:', data['office-address']),
      sectionHead('4', 'PURPOSE OF PROPERTY'),
      {
        columns: [
          { width:'auto', columns:[box(chkd(data,'purpose','Self Use')),{ text:'Self Use',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'purpose','Investment')),{ text:'Investment',style:'checkLabel',width:'auto'}],columnGap:4}
        ],
        columnGap: 20,
        margin: [0, 1, 0, 3]
      },
      sectionHead('5', 'PAYMENT TERMS'),
      {
        columns: [
          { width:'auto', columns:[box(chkd(data,'payment-terms','Self')),{ text:'Self',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'payment-terms','Loan')),{ text:'Loan',style:'checkLabel',width:'auto'}],columnGap:4}
        ],
        columnGap: 20,
        margin: [0, 1, 0, 3]
      },
      sectionHead('6', 'PAYMENT DETAILS'),
      {
        columns: [
          { width:'auto', columns:[box(chkd(data,'payment-source','Self')),{ text:'Self',style:'checkLabel',width:'auto'}],columnGap:4},
          { width:'auto', columns:[box(chkd(data,'payment-source','Loan')),{ text:'Loan',style:'checkLabel',width:'auto'}],columnGap:4}
        ],
        columnGap: 20,
        margin: [0, 1, 0, 4]
      },
      fieldW('Amount: ₹', data['payment-amount'], 'auto', 160),
      { text: [{ text: 'Mode:', bold: true }, { text: ' Cheque / DD / UTR / Transfer' }], style: 'fieldLabel', margin: [0, 0, 0, 3] },
      fieldW('Cheque/DD/UTR No.:', data['cheque-no'], 'auto', 180),
      fieldW('Account Name.:', data['account-name'], 'auto', 200),
      fieldW('Account No.:', data['account-no'], 'auto', 200),
      fieldW('Bank Name.:', data['bank-name'], 'auto', 200),
      fieldW('Branch Name.:', data['branch-name'], 'auto', 200),
      fieldW('IFSC Code.:', data['ifsc-code'], 'auto', 200),
      // Dated: show only the value OR blank placeholder — never both
      fieldW('Dated:', payDate || '__ / __ / ______', 'auto', 120),
      {
        text: [
          { text: 'Note: ', bold: true },
          { text: 'Through cheque or bank transfer ' },
          { text: 'of 10% of the agreement value', bold: true },
          { text: ' must be handed over or transferred within ' },
          { text: '15 days of signing the booking form.', bold: true },
          { text: '\nFailure to do so, empowers the Promoter to revoke the booking and refund the token amount to the applicant\'s account.' }
        ],
        style: 'noteText',
        margin: [0, 5, 0, 8]
      },
      // ── Promoter Bank Details — each field on its own line ────────────────
      { text: 'Payment Details (Promoter Account):', style: 'bankHead', margin: [0, 0, 0, 3] },
      {
        text: [{ text: 'Account Name: ', style: 'bankLabel' }, { text: bank.accountName, bold: true, fontSize: 9 }],
        margin: [0, 0, 0, 2]
      },
      {
        text: [{ text: 'Account No.: ', style: 'bankLabel' }, { text: bank.accountNo, bold: true, fontSize: 9 }],
        margin: [0, 0, 0, 2]
      },
      {
        text: [{ text: 'Bank: ', style: 'bankLabel' }, { text: bank.bank, bold: true, fontSize: 9 }],
        margin: [0, 0, 0, 2]
      },
      {
        text: [{ text: 'Branch: ', style: 'bankLabel' }, { text: bank.branch, bold: true, fontSize: 9 }],
        margin: [0, 0, 0, 2]
      },
      {
        text: [{ text: 'IFSC Code: ', style: 'bankLabel' }, { text: bank.ifsc, bold: true, fontSize: 9 }],
        margin: [0, 0, 0, 2]
      }
    ];
  }

  // ── PAGE 4: Source, Declaration, Terms 1–9 ─────────────────
  function buildPage4(data, cfg) {
    const SOURCES = ['Direct', 'Presales', 'Digital', 'Corporate', 'Loyalty', 'Referral', 'Channel Partner'];
    const r1 = fv(data['received-by-1']);
    const r2 = fv(data['received-by-2']);
    const co = cfg.company;

    return [
      { text: '', pageBreak: 'before' },
      pageHeader(),
      pageSubHeader(),
      sectionHead('7', 'APPLICATION SOURCE'),
      {
        columns: SOURCES.map(s => ({
          width: 'auto',
          columns: [
            box(chkd(data, 'app-source', s)),
            { text: s, style: 'checkLabel', width: 'auto' }
          ],
          columnGap: 4
        })),
        columnGap: 8,
        margin: [0, 1, 0, 4]
      },
      fieldW('Referred by:', data['referred-by'], 'auto', 240),
      { text: 'Channel Partner Details (if applicable):', style: 'subHead', margin: [0, 4, 0, 2] },
      fieldW('RERA ID:', data['cp-rera'], 'auto', 180),
      fieldW('Firm Name:', data['cp-firm'], 'auto', 180),
      fieldW('Mobile No.:', data['cp-mobile'], 'auto', 180),
      sectionHead('8', 'DECLARATION & SIGNATURES'),
      {
        text: 'I/We hereby declare that the information provided is accurate and complete. I/We accept the terms and conditions of booking and confirm my/our acceptance to pay applicable TDS and provide proof to the Promoter.',
        style: 'bodyText',
        margin: [0, 0, 0, 6]
      },
      fieldW('Signature of Primary Applicant:', '', 'auto', 160),
      { text: 'Date: __ / __ / ______          Time: ______', style: 'fieldLabel', margin: [0, 2, 0, 4] },
      fieldW('Signature of Channel Partner (if applicable):', '', 'auto', 100),
      // Received by — Sales Manager 1
      {
        columns: [
          fieldW('Received by:', r1, 'auto', 140),
          { text: 'on: __ / __ / ______', style: 'fieldLabel', width: 'auto', margin: [8, 0, 0, 0] }
        ],
        margin: [0, 5, 0, 2]
      },
      { text: '(Sales Manager 1)', style: 'sigLabel', margin: [0, 0, 0, 4] },
      // Received by — Sales Manager 2
      fieldW('Received by:', r2, 'auto', 140),
      { text: '(Sales Manager 2)', style: 'sigLabel', margin: [0, 0, 0, 6] },
      { text: 'Terms and conditions', style: 'termsHead', margin: [0, 4, 0, 4] },
      term(1, `Self-attested proof of address and Pan Card copy needs to be attached along with this form. If the booking is in joint name, then both applicants need to sign this form and submit all necessary documents.`),
      term(2, `The Applicant(s) shall get his/ her name, complete address, PAN No., e-mail I.D, phone No., Aadhar no. registered with ${co} at the time of booking and it shall be his/ her responsibility to inform ${co} by registered A/D letter about all subsequent changes, if any, in his/ her address, failing which all demand notices and letters posted at the first registered address will be deemed to have been served/ received by him/ her at the time when those should ordinarily reach such address and the Applicant(s) shall be responsible for any default in payment and other consequences that might occur thereof.`),
      term(3, `The provisional booking does not convey in favour of Applicant(s) any right, title or interest of whatsoever nature unless and until required documents such as Sale Agreement / Sale Deed etc. are executed.`),
      term(4, `The Applicant(s) shall not transfer/ assign the said Unit without the prior written consent/ approval of ${co}. ${co} may, in its sole discretion, refuse or allow the same on such terms and conditions as it may deem fit and proper, and upon payment of such charges as may be fixed by ${co} from time to time.`),
      term(5, `In case of joint application, all the correspondence shall be done only with the 'First Applicant' at the address for communication as it appears on the application form.`),
      term(6, `The payments must be made in accordance with the payment schedule mentioned the agreement for sale.`),
      term(7, `The Applicant(s) has/have inspected the location of the project and having being satisfied with the location and explanation of the project, have signed and submitted this form to ${co} for booking the apartment/unit. The applicant has also read and understood the details and specifications of the project contained in the brochure/details provided by ${co}.`),
      term(8, `The Applicant(s) at his/her discretion and cost may avail housing loan from bank / financial institution. The Applicant(s) shall endeavour to obtain necessary loan sanctions within 30 days from the date of provisional booking. ${co} shall under no circumstances be held responsible for non-sanction of the loan to the Applicant(s) for whatsoever reason.`),
      term(9, `The Applicant(s) is aware that in addition to the Total Price of the Unit, the Applicant(s) shall be liable and responsible to pay all taxes and charges in connection with his / her unit.`)
    ];
  }

  /** Numbered term paragraph */
  function term(n, text) {
    return {
      columns: [
        { text: `${n}.`, style: 'termNum', width: 14 },
        { text, style: 'termText', width: '*' }
      ],
      columnGap: 2,
      margin: [0, 0, 0, 2]
    };
  }

  // ── PAGE 5: Terms 10–16 + Final Signatures + Declaration ──
  function buildPage5(data, cfg) {
    const co = cfg.company;
    return [
      { text: '', pageBreak: 'before' },
      pageHeader(),
      { text: '', margin: [0, 4, 0, 0] },
      term(10, `The Applicant(s) shall also be liable to pay External Development Charges (EDC) (if applicable), Internal Development Charges (IDC) (if applicable), maintenance charges, charges towards Share money, application entrance fee of the Society / Limited Company, Federation / Apex Body, formation and registration of the Society / Limited Company / Federation / Apex Body / Legal Charges, proportionate share of taxes and other charges/levies in respect of the Society/Limited Company/ Federation/Apex Body, deposit towards provisional yearly contribution towards outgoings of Society/Limited Company/Federation/Apex Body, deposit towards Water, Electric and other utility and services connection charge, deposits of electrical receiving and sub-station provided in the layout, charges for formation of conveyance deed, and any other charges mentioned in the agreement for sale along with appropriate taxes.`),
      term(11, `The Applicant(s) agrees to execute the Agreement for sale in ${cfg.termsAgreement} within 15 days from the date of sending the agreement for execution by the Promotor.`),
      term(12, `Until the entire amount is paid by the Applicant(s), ${co} shall have the first lien on the said apartment/ Unit.`),
      term(13, `Assignment of the said unit is subject to terms and conditions and payment of prescribed fees.`),
      term(14, `All disputes relating to/arising out of this application form are subject to the exclusive jurisdiction of the courts In ${cfg.jurisdiction}.`),
      term(15, `Upon execution of Agreement for sale by the applicant with the Promotor, all the necessary steps will be taken according to the termination /cancellation procedure mentioned in the agreement for sale.`),
      term(16, `Upon execution of Agreement for sale by the applicant with the Promotor other Terms & Conditions mentioned in Agreement for Sale / Deed shall be applicable.`),
      // "I accept to the terms and conditions:" + two sig lines on same row
      {
        margin: [0, 18, 0, 0],
        columns: [
          { text: 'I accept to the terms and conditions:', style: 'subHead', width: 'auto', margin: [0, 15, 10, 0] },
          sigBlock('Sales Executive'),
          { width: 20, text: '' },
          sigBlock('Applicant')
        ]
      },
      // Confirmed by — centered
      {
        columns: [
          { width: '*', text: '' },
          sigBlock('Confirmed by'),
          { width: '*', text: '' }
        ],
        margin: [0, 20, 0, 26]
      },
      { text: 'Declaration:', style: 'termsHead', margin: [0, 0, 0, 3] },
      {
        text: 'I/We, the undersigned Applicant(s) (Sole/First and Co/Second applicant), do hereby declare that the above mentioned particulars/information given by me/us are irrevocable, true and correct to my/our knowledge and no material fact has been concealed there from. I/We have gone through the terms and conditions written in this form and agreement for sale and accept the same and which shall ipso-facto be applicable to my/our legal heirs and successors. I/We declare that in case of non-allotment of the apartment/unit, my/our claim shall be limited only to the extent of amount paid by me/us in relation to this application form. All the above Terms & conditions are read over by the Applicant(s) personally and understood the same in vernacular and the same are accepted to the Applicant(s).',
        style: 'bodyText'
      }
    ];
  }

  // ── PAGE 6: KYC Documents ─────────────────────────────────
  function buildPageKYC(data) {
    const hasA = window._aadhaarImageURL || data.aadhaarImageURL;
    const hasP = window._panImageURL || data.panImageURL;
    if (!hasA && !hasP) return [];

    const items = [
      { text: '', pageBreak: 'before' },
      pageHeader(),
      {
        text: `KYC Documents — ${fv(data['primary-name']) || 'Applicant'}`,
        style: 'sectionHead',
        margin: [0, 10, 0, 14]
      }
    ];

    if (hasA) {
      items.push({ image: hasA, fit: [420, 280], alignment: 'center', margin: [0, 6, 0, 4] });
      items.push({
        text: `Aadhaar Card — ${fv(data['primary-name']) || 'Applicant'}`,
        style: 'docLabel', alignment: 'center', margin: [0, 0, 0, 14]
      });
    }
    if (hasP) {
      items.push({ image: hasP, fit: [420, 280], alignment: 'center', margin: [0, 6, 0, 4] });
      items.push({
        text: `PAN Card — ${fv(data['primary-name']) || 'Applicant'}`,
        style: 'docLabel', alignment: 'center', margin: [0, 0, 0, 14]
      });
    }
    return items;
  }

  // ── pdfmake style definitions ──────────────────────────────
  function getStyles() {
    return {
      pageHeader:    { fontSize: 15, bold: true, color: '#ffffff', alignment: 'center', characterSpacing: 2 },
      pageSubHeader: { fontSize: 8,  color: '#555', alignment: 'center' },
      metaLabel:     { fontSize: 10, bold: true, color: '#000' },
      metaValue:     { fontSize: 10, color: '#000' },
      sectionHead:   { fontSize: 10.5, bold: true, color: '#000' },
      subHead:       { fontSize: 9,  bold: true, color: '#000' },
      smallNote:     { fontSize: 7.5, color: '#444' },
      colHeader:     { fontSize: 8,   bold: true, color: '#000' },
      fieldLabel:    { fontSize: 8.5, color: '#000' },
      fieldValue:    { fontSize: 8.5, color: '#000' },
      checkLabel:    { fontSize: 8.5, color: '#000' },
      noteText:      { fontSize: 7.5, color: '#111', lineHeight: 1.35 },
      bankHead:      { fontSize: 8.5, bold: true,  color: '#000' },
      bankLabel:     { fontSize: 8.5, color: '#000' },
      bodyText:      { fontSize: 8,   color: '#111', lineHeight: 1.45 },
      termsHead:     { fontSize: 9,   bold: true,  color: '#000' },
      termNum:       { fontSize: 7.5, color: '#111', lineHeight: 1.4 },
      termText:      { fontSize: 7.5, color: '#111', lineHeight: 1.4 },
      sigLabel:      { fontSize: 8,   color: '#444', alignment: 'center' },
      coverKonnark:  { fontSize: 22,  bold: true,  characterSpacing: 6, color: '#000', alignment: 'center' },
      coverProject:  { fontSize: 50,  bold: true,  color: '#000', alignment: 'center' },
      coverBadge:    { fontSize: 16,  bold: true,  color: '#ffffff', alignment: 'center', characterSpacing: 3 },
      coverFooter:   { fontSize: 8,   color: '#333', lineHeight: 1.5, alignment: 'center' },
      docLabel:      { fontSize: 9,   bold: true,  color: '#1C2B4A' }
    };
  }

  // ── Main: generate & download ──────────────────────────────
  async function generate(data, cfg) {
    const btn = document.getElementById('btn-generate-pdf');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(10,15,30,0.25);border-top-color:#0a0f1e;border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;vertical-align:middle;"></span>Generating PDF…';
    }

    try {
      if (typeof pdfMake === 'undefined') {
        throw new Error('pdfMake library not loaded. Check your script tags.');
      }

      // Load custom Inter font & logo watermark image
      const fontReady = await loadInterFont();
      const activeFont = (fontReady && typeof pdfMake !== 'undefined' && pdfMake.fonts && pdfMake.fonts.Inter) ? 'Inter' : 'Roboto';

      const logoData = await loadLogoBase64();

      const content = [
        ...buildPage1(data, cfg, logoData),
        ...buildPage2(data),
        ...buildPage3(data, cfg),
        ...buildPage4(data, cfg),
        ...buildPage5(data, cfg),
        ...buildPageKYC(data)
      ];

      const docDef = {
        pageSize: 'A4',
        pageMargins: [28, 28, 28, 28],
        background: function(currentPage) {
          if (currentPage > 1 && logoData) {
            return {
              image: logoData,
              width: 380,
              opacity: 0.07,
              absolutePosition: { x: 108, y: 220 }
            };
          }
          return null;
        },
        content,
        styles: getStyles(),
        defaultStyle: {
          font: activeFont,
          fontSize: 8.5,
          color: '#000',
          lineHeight: 1.1
        }
      };

      const fname = `${cfg.projectName.replace(/\s+/g, '_')}_Booking_Form_${fv(data.formNo) || 'Draft'}.pdf`;
      pdfMake.createPdf(docDef).download(fname);

      if (typeof KonnarkForm !== 'undefined') {
        KonnarkForm.showToast('✓ PDF downloaded successfully!', 'success');
        setTimeout(() => {
          KonnarkForm.clearForm();
        }, 2000);
      }

    } catch (err) {
      console.error('[KonnarkPDF]', err);
      const msg = err.message || 'Unknown error';
      if (typeof KonnarkForm !== 'undefined') {
        KonnarkForm.showToast('PDF generation failed: ' + msg, 'error');
      } else {
        alert('PDF generation failed: ' + msg);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '⬇ Generate &amp; Download PDF';
      }
    }
  }

  return { generate };

})();
