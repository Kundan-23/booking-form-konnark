// Konnark Form Engine
// Multi-step form orchestration for digital booking forms

const KonnarkForm = (function() {
  let currentStep = 0;
  let totalSteps = 8; // Indices 0 through 8 (Total 9 steps: Steps 1-8 + Review)
  let config = null;
  let formData = {};
  let formNo = '';

  // Initialize form with project config
  function init(projectConfig) {
    config = projectConfig;

    // Force fresh form if URL contains ?new=1 or ?reset=1
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('new') || urlParams.get('reset')) {
      try { localStorage.removeItem(`konnark_form_${config.projectId}`); } catch (e) {}
    }

    // Generate or restore form number
    const savedData = loadFromStorage();
    if (savedData && savedData.formNo) {
      formData = savedData;
      formNo = savedData.formNo;
      restoreFormFields();
    } else {
      formNo = generateFormNo(config.formPrefix);
      formData = { formNo, projectId: config.projectId };
    }

    // Set form number display
    const formNoEl = document.getElementById('form-number');
    if (formNoEl) formNoEl.textContent = formNo;

    // Set today's date
    const dateEl = document.getElementById('form-date');
    if (dateEl) {
      if (!dateEl.value) dateEl.value = todayISO();
    }

    // Set typology options
    renderTypologyOptions();

    // Set promoter bank details
    renderBankDetails();

    // Setup navigation
    setupNavigation();

    // Setup conditional fields
    setupConditionals();

    // Setup document attachment handlers
    setupDocumentUploadHandlers();

    // Setup cost sheet calculation listeners
    setupCostSheetCalculations();

    // Setup signature pad handlers
    setupSignaturePad();

    // Setup auto-save
    setupAutoSave();

    // Update step display
    updateStepDisplay();

    // Show first step
    showStep(0);

    console.log(`Konnark Form initialized: ${config.projectName} | Form No: ${formNo}`);
  }

  function renderTypologyOptions() {
    const container = document.getElementById('typology-options');
    if (!container || !config.typologyOptions) return;
    container.innerHTML = config.typologyOptions.map(opt => `
      <label class="checkbox-option">
        <input type="checkbox" name="typology" value="${opt}" data-field="typology">
        <span>${opt}</span>
      </label>
    `).join('');
  }

  function renderBankDetails() {
    const bank = config.promoterBank;
    const container = document.getElementById('promoter-bank-details');
    if (!container || !bank) return;
    container.innerHTML = `
      <div class="bank-details-card">
        <p class="subsection-title" style="font-size:0.75rem;margin-bottom:0.75rem;">Payment Details (Promoter Account)</p>
        <div class="review-field"><span class="field-label">Account Name</span><span>${bank.accountName}</span></div>
        <div class="review-field"><span class="field-label">Account No.</span><span>${bank.accountNo}</span></div>
        <div class="review-field"><span class="field-label">Bank</span><span>${bank.bank}</span></div>
        <div class="review-field"><span class="field-label">Branch</span><span>${bank.branch}</span></div>
        <div class="review-field"><span class="field-label">IFSC Code</span><span>${bank.ifsc}</span></div>
      </div>
    `;
  }

  function setupNavigation() {
    const btnNext = document.getElementById('btn-next');
    const btnPrev = document.getElementById('btn-prev');

    if (btnNext) btnNext.addEventListener('click', nextStep);
    if (btnPrev) btnPrev.addEventListener('click', prevStep);

    // Clickable Stepper Pills
    document.querySelectorAll('.step-nav-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const targetStep = parseInt(pill.dataset.navStep, 10);
        if (!isNaN(targetStep)) {
          showStep(targetStep);
        }
      });
    });

    // PDF button
    const btnPDF = document.getElementById('btn-generate-pdf');
    if (btnPDF) btnPDF.addEventListener('click', () => {
      if (typeof KonnarkPDF !== 'undefined') {
        KonnarkPDF.generate(collectAllFormData(), config);
      }
    });
  }

  function setupConditionals() {
    // Show/hide channel partner fields based on source selection
    const cpCheckbox = document.getElementById('source-channel-partner');
    const cpDetails = document.getElementById('channel-partner-details');
    if (cpCheckbox && cpDetails) {
      cpCheckbox.addEventListener('change', () => {
        cpDetails.style.display = cpCheckbox.checked ? 'block' : 'none';
      });
    }

    // Communication address toggle
    const sameAsPermCheckbox = document.getElementById('comm-same-as-perm');
    const commAddressFields = document.getElementById('comm-address-fields');
    if (sameAsPermCheckbox && commAddressFields) {
      sameAsPermCheckbox.addEventListener('change', () => {
        commAddressFields.style.display = sameAsPermCheckbox.checked ? 'none' : 'block';
        if (sameAsPermCheckbox.checked) {
          // Copy permanent address fields
          ['house','street','locality','city','state','pin'].forEach(field => {
            const perm = document.getElementById(`primary-${field}`);
            const comm = document.getElementById(`comm-${field}`);
            if (perm && comm) comm.value = perm.value;
          });
        }
      });
      // Default: hide comm address (same as permanent)
      sameAsPermCheckbox.checked = true;
      commAddressFields.style.display = 'none';
    }

    // Co-applicant 1 toggle
    const coApp1Toggle = document.getElementById('add-coapplicant-1');
    const coApp1Section = document.getElementById('coapplicant-1-section');
    if (coApp1Toggle && coApp1Section) {
      coApp1Toggle.addEventListener('click', () => {
        const isOpen = coApp1Section.style.display === 'block';
        coApp1Section.style.display = isOpen ? 'none' : 'block';
        coApp1Toggle.textContent = isOpen ? '+ Add Co-Applicant 1' : '− Remove Co-Applicant 1';
      });
    }

    // Co-applicant 2 toggle
    const coApp2Toggle = document.getElementById('add-coapplicant-2');
    const coApp2Section = document.getElementById('coapplicant-2-section');
    if (coApp2Toggle && coApp2Section) {
      coApp2Toggle.addEventListener('click', () => {
        const isOpen = coApp2Section.style.display === 'block';
        coApp2Section.style.display = isOpen ? 'none' : 'block';
        coApp2Toggle.textContent = isOpen ? '+ Add Co-Applicant 2' : '− Remove Co-Applicant 2';
      });
    }

    // Hide channel partner details by default
    const cpDet = document.getElementById('channel-partner-details');
    if (cpDet) cpDet.style.display = 'none';

    // Hide co-applicant sections by default
    ['coapplicant-1-section', 'coapplicant-2-section'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function setupDocumentUploadHandlers() {
    ['aadhaar', 'pan'].forEach(type => {
      const input = document.getElementById(`upload-${type}`);
      const area = document.getElementById(`upload-${type}-area`) || document.getElementById(`ocr-${type}-area`);
      const status = document.getElementById(`upload-${type}-status`) || document.getElementById(`ocr-${type}-status`);
      const preview = document.getElementById(`upload-${type}-preview`) || document.getElementById(`ocr-${type}-preview`);

      if (input && area) {
        area.addEventListener('click', () => input.click());
        area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
        area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
        area.addEventListener('drop', e => {
          e.preventDefault();
          area.classList.remove('drag-over');
          if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0], type, status, preview);
        });
        input.addEventListener('change', e => {
          if (e.target.files[0]) handleFileSelect(e.target.files[0], type, status, preview);
        });
      }
    });
  }

  function handleFileSelect(file, type, statusEl, previewEl) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataURL = e.target.result;
      if (type === 'aadhaar') window._aadhaarImageURL = dataURL;
      if (type === 'pan') window._panImageURL = dataURL;

      if (previewEl) {
        previewEl.src = dataURL;
        previewEl.style.display = 'block';
      }
      if (statusEl) {
        statusEl.textContent = `✓ ${type === 'aadhaar' ? 'Aadhaar' : 'PAN'} Card image attached`;
        statusEl.className = 'ocr-status success';
      }
      showToast(`${type === 'aadhaar' ? 'Aadhaar' : 'PAN'} Card attached!`, 'success');
      saveToStorage();
    };
    reader.readAsDataURL(file);
  }

  function setupCostSheetCalculations() {
    const payAmtInput = document.getElementById('payment-amount');
    const dealAmtInput = document.getElementById('deal-amount-agreed');

    if (payAmtInput && dealAmtInput) {
      payAmtInput.addEventListener('input', () => {
        if (!dealAmtInput.value || dealAmtInput.dataset.manual !== 'true') {
          dealAmtInput.value = payAmtInput.value;
        }
      });
      dealAmtInput.addEventListener('input', () => {
        dealAmtInput.dataset.manual = 'true';
      });
    }
  }

  function setupSignaturePad() {
    const sigModeRadios = document.querySelectorAll('input[name="sig-mode"]');
    const container = document.getElementById('digital-sig-container');
    const canvas = document.getElementById('signature-canvas');
    const btnClear = document.getElementById('btn-clear-sig');
    const placeholder = document.getElementById('sig-canvas-placeholder');

    if (!canvas) return;

    let ctx = canvas.getContext('2d');
    let isDrawing = false;
    let hasDrawn = false;

    function resizeCanvas(preserve) {
      let saved = null;
      if (preserve && (hasDrawn || window._applicantSignatureURL)) {
        try { saved = canvas.toDataURL('image/png'); } catch (e) {}
      }

      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width > 0 ? rect.width : 500;
      const cssHeight = rect.height > 0 ? rect.height : 160;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);

      ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0a192f';

      const restoreSrc = saved || window._applicantSignatureURL;
      if (restoreSrc) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
          hasDrawn = true;
          if (placeholder) placeholder.style.display = 'none';
        };
        img.src = restoreSrc;
      }
    }

    sigModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'digital' && radio.checked) {
          if (container) container.style.display = 'block';
          setTimeout(() => resizeCanvas(true), 60);
        } else if (radio.value === 'manual' && radio.checked) {
          if (container) container.style.display = 'none';
        }
        saveToStorage();
        if (currentStep === totalSteps) populateReview();
      });
    });

    function getPointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    canvas.addEventListener('pointerdown', e => {
      isDrawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      const pos = getPointerPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      if (placeholder) placeholder.style.display = 'none';
    });

    canvas.addEventListener('pointermove', e => {
      if (!isDrawing) return;
      const pos = getPointerPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      hasDrawn = true;
    });

    function stopDrawing(e) {
      if (!isDrawing) return;
      isDrawing = false;
      if (e && e.pointerId) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      if (hasDrawn) {
        window._applicantSignatureURL = canvas.toDataURL('image/png');
        saveToStorage();
        if (currentStep === totalSteps) populateReview();
      }
    }

    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('pointerleave', stopDrawing);

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width || canvas.width, rect.height || canvas.height);
        hasDrawn = false;
        window._applicantSignatureURL = null;
        if (placeholder) placeholder.style.display = 'flex';
        saveToStorage();
        if (currentStep === totalSteps) populateReview();
        showToast('Signature erased. You can draw again.', 'info');
      });
    }

    window.addEventListener('resize', () => {
      if (container && container.style.display !== 'none') {
        resizeCanvas(true);
      }
    });
  }

  function setupAutoSave() {
    document.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('change', () => saveToStorage());
    });
    setInterval(saveToStorage, 30000);
  }

  function collectAllFormData() {
    const data = { formNo, projectId: config.projectId, generatedAt: new Date().toISOString() };
    document.querySelectorAll('[data-field]').forEach(el => {
      const key = el.dataset.field;
      if (el.type === 'checkbox') {
        if (!data[key]) data[key] = [];
        if (el.checked) data[key].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) data[key] = el.value;
      } else {
        data[key] = el.value;
      }
    });

    // Secondary pass: ensure all checked checkboxes and radios in DOM are captured
    document.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').forEach(el => {
      const key = el.dataset.field || el.name;
      if (key) {
        if (el.type === 'checkbox') {
          if (!data[key]) data[key] = [];
          if (Array.isArray(data[key]) && !data[key].includes(el.value)) {
            data[key].push(el.value);
          }
        } else if (el.type === 'radio') {
          data[key] = el.value;
        }
      }
    });

    // If communication address same as permanent, copy permanent fields
    const samePerm = document.getElementById('comm-same-as-perm');
    if (samePerm && samePerm.checked) {
      data['comm-same-as-perm'] = true;
      ['house','street','locality','city','state','pin'].forEach(f => {
        data[`comm-${f}`] = data[`primary-${f}`] || '';
      });
    }

    if (window._aadhaarImageURL) data.aadhaarImageURL = window._aadhaarImageURL;
    if (window._panImageURL) data.panImageURL = window._panImageURL;

    const sigMode = document.querySelector('input[name="sig-mode"]:checked')?.value || 'manual';
    data.sigMode = sigMode;
    if (sigMode === 'digital' && window._applicantSignatureURL) {
      data.applicantSignature = window._applicantSignatureURL;
    } else {
      data.applicantSignature = null;
    }

    console.log('[collectAllFormData]', data);
    return data;
  }

  function saveToStorage() {
    if (!config) return;
    const data = collectAllFormData();
    try {
      localStorage.setItem(`konnark_form_${config.projectId}`, JSON.stringify(data));
    } catch (e) {
      console.warn('Storage quota exceeded or unavailable:', e);
    }
  }

  function loadFromStorage() {
    if (!config) return null;
    try {
      const raw = localStorage.getItem(`konnark_form_${config.projectId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function restoreFormFields() {
    if (!formData) return;
    Object.entries(formData).forEach(([key, value]) => {
      const els = document.querySelectorAll(`[data-field="${key}"]`);
      els.forEach(el => {
        if (el.type === 'checkbox') {
          if (Array.isArray(value)) el.checked = value.includes(el.value);
        } else if (el.type === 'radio') {
          el.checked = el.value === value;
        } else {
          el.value = value || '';
        }
      });
    });

    if (formData.aadhaarImageURL) {
      window._aadhaarImageURL = formData.aadhaarImageURL;
      const prev = document.getElementById('upload-aadhaar-preview') || document.getElementById('ocr-aadhaar-preview');
      const stat = document.getElementById('upload-aadhaar-status') || document.getElementById('ocr-aadhaar-status');
      if (prev) { prev.src = formData.aadhaarImageURL; prev.style.display = 'block'; }
      if (stat) { stat.textContent = '✓ Aadhaar Card attached'; stat.className = 'ocr-status success'; }
    }
    if (formData.panImageURL) {
      window._panImageURL = formData.panImageURL;
      const prev = document.getElementById('upload-pan-preview') || document.getElementById('ocr-pan-preview');
      const stat = document.getElementById('upload-pan-status') || document.getElementById('ocr-pan-status');
      if (prev) { prev.src = formData.panImageURL; prev.style.display = 'block'; }
      if (stat) { stat.textContent = '✓ PAN Card attached'; stat.className = 'ocr-status success'; }
    }

    if (formData.sigMode) {
      const radio = document.querySelector(`input[name="sig-mode"][value="${formData.sigMode}"]`);
      if (radio) {
        radio.checked = true;
        const container = document.getElementById('digital-sig-container');
        if (container) container.style.display = formData.sigMode === 'digital' ? 'block' : 'none';
      }
    }
    if (formData.applicantSignature) {
      window._applicantSignatureURL = formData.applicantSignature;
      const ph = document.getElementById('sig-canvas-placeholder');
      if (ph) ph.style.display = 'none';
    }
  }

  function validateStep(step) {
    const stepEl = document.querySelector(`.form-step[data-step="${step}"]`);
    if (!stepEl) return true;

    let valid = true;
    const requiredFields = stepEl.querySelectorAll('[required]');

    requiredFields.forEach(field => {
      const value = field.value.trim();
      if (!value) {
        field.classList.add('error');
        valid = false;
      } else {
        field.classList.remove('error');
      }
    });

    if (!valid) showToast('Please fill all required fields.', 'error');
    return valid;
  }

  function nextStep() {
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps) {
      saveToStorage();
      currentStep++;
      showStep(currentStep);
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  }

  function showStep(step) {
    currentStep = step;
    document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.form-step[data-step="${step}"]`);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Sync Stepper Pills
    document.querySelectorAll('.step-nav-pill').forEach((pill, idx) => {
      pill.classList.toggle('active', idx === step);
    });
    const activePill = document.querySelector(`.step-nav-pill[data-nav-step="${step}"]`);
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    if (step === 7) {
      // Auto-prefill Cost Sheet & Deal fields from earlier steps if blank
      const nameEl = document.getElementById('cs-client-name');
      if (nameEl && !nameEl.value.trim()) {
        const title = (document.getElementById('primary-title')?.value || '').trim();
        const pName = (document.getElementById('primary-name')?.value || '').trim();
        nameEl.value = `${title} ${pName}`.trim();
      }
      const unitEl = document.getElementById('cs-unit-no');
      if (unitEl && !unitEl.value.trim()) {
        unitEl.value = (document.getElementById('flat-no')?.value || '').trim();
      }
      const configEl = document.getElementById('cs-configuration');
      if (configEl && !configEl.value.trim()) {
        const checkedTypology = Array.from(document.querySelectorAll('input[name="typology"]:checked')).map(el => el.value);
        configEl.value = checkedTypology.join(', ');
      }
      const dealAmtEl = document.getElementById('deal-amount-agreed');
      if (dealAmtEl && !dealAmtEl.value.trim()) {
        const payAmt = document.getElementById('payment-amount')?.value || '';
        dealAmtEl.value = payAmt;
      }
    }

    if (step === totalSteps) {
      populateReview();
      const digitalRadio = document.querySelector('input[name="sig-mode"][value="digital"]');
      if (digitalRadio && digitalRadio.checked) {
        const container = document.getElementById('digital-sig-container');
        if (container) container.style.display = 'block';
        setTimeout(() => {
          const canvas = document.getElementById('signature-canvas');
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0) {
              const dpr = window.devicePixelRatio || 1;
              canvas.width = Math.round(rect.width * dpr);
              canvas.height = Math.round(rect.height * dpr);
              const ctx = canvas.getContext('2d');
              ctx.scale(dpr, dpr);
              ctx.lineWidth = 2.5;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = '#0a192f';
              if (window._applicantSignatureURL) {
                const img = new Image();
                img.onload = () => {
                  ctx.drawImage(img, 0, 0, rect.width, rect.height);
                  const ph = document.getElementById('sig-canvas-placeholder');
                  if (ph) ph.style.display = 'none';
                };
                img.src = window._applicantSignatureURL;
              }
            }
          }
        }, 60);
      }
    }

    updateStepDisplay();
  }

  function updateStepDisplay() {
    const stepText = document.getElementById('step-text');
    const progressFill = document.getElementById('progress-fill');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const navStepInfo = document.getElementById('nav-step-info');

    const isReview = currentStep === totalSteps;
    const isFirst = currentStep === 0;
    const totalCount = totalSteps + 1; // 9 total steps (1-8 + Review)

    if (stepText) stepText.textContent = isReview ? 'Review & Generate' : `Step ${currentStep + 1} of ${totalCount}`;
    if (navStepInfo) navStepInfo.textContent = isReview ? 'Review & Generate PDF' : `Step ${currentStep + 1} / ${totalCount}`;
    if (progressFill) progressFill.style.width = `${((currentStep) / totalSteps) * 100}%`;

    if (btnPrev) btnPrev.style.display = isFirst ? 'none' : 'flex';
    if (btnNext) {
      btnNext.style.display = isReview ? 'none' : 'flex';
      if (currentStep === 6) {
        btnNext.textContent = 'Next: Deal Confirmation Terms →';
      } else if (currentStep === 7) {
        btnNext.textContent = 'Next: Review & Generate PDF →';
      } else {
        btnNext.textContent = 'Next →';
      }
    }
  }

  function populateReview() {
    const data = collectAllFormData();
    const container = document.getElementById('review-content');
    if (!container) return;

    const hasAadhaar = !!window._aadhaarImageURL;
    const hasPAN = !!window._panImageURL;
    const hasDealData = !!(data['deal-amount-agreed'] || data['payment-amount']);

    container.innerHTML = `
      ${!hasDealData ? `
        <div class="cost-sheet-alert-banner" onclick="KonnarkForm.showStep(7)">
          <div>
            <div style="font-weight:700;font-size:0.85rem;color:#C9A96E;">⚠️ Deal Confirmation Terms are blank!</div>
            <div style="font-size:0.75rem;color:#d0d7de;margin-top:2px;">Tap here to enter agreed amount, parking &amp; maintenance terms in Step 8 before downloading PDF.</div>
          </div>
          <button type="button" class="btn btn-primary" style="font-size:0.75rem;padding:0.4rem 0.8rem;white-space:nowrap;">Fill Now →</button>
        </div>
      ` : ''}

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">Form Details</p>
          <button type="button" class="review-edit-btn" onclick="KonnarkForm.showStep(0)">✏️ Edit</button>
        </div>
        <div class="review-field"><span class="field-label">Form No.</span><span>${data.formNo || ''}</span></div>
        <div class="review-field"><span class="field-label">Date</span><span>${formatDate(data['form-date']) || ''}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">Primary Applicant</p>
          <button type="button" class="review-edit-btn" onclick="KonnarkForm.showStep(0)">✏️ Edit</button>
        </div>
        <div class="review-field"><span class="field-label">Name</span><span>${(data['primary-title'] || '') + ' ' + (data['primary-name'] || '')}</span></div>
        <div class="review-field"><span class="field-label">DOB</span><span>${formatDate(data['primary-dob']) || ''}</span></div>
        <div class="review-field"><span class="field-label">Mobile</span><span>${data['primary-mobile'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Email</span><span>${data['primary-email'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Aadhaar No.</span><span>${data['primary-aadhaar'] || ''}</span></div>
        <div class="review-field"><span class="field-label">PAN No.</span><span>${data['primary-pan'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Address</span><span>${[data['primary-house'], data['primary-street'], data['primary-locality'], data['primary-city'], data['primary-state'], data['primary-pin']].filter(Boolean).join(', ')}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">Application Details</p>
          <button type="button" class="review-edit-btn" onclick="KonnarkForm.showStep(1)">✏️ Edit</button>
        </div>
        <div class="review-field"><span class="field-label">Flat No.</span><span>${data['flat-no'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Wing</span><span>${data['wing'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Floor</span><span>${data['floor'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Typology</span><span>${Array.isArray(data['typology']) ? data['typology'].join(', ') : (data['typology'] || '')}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">Payment</p>
          <button type="button" class="review-edit-btn" onclick="KonnarkForm.showStep(4)">✏️ Edit</button>
        </div>
        <div class="review-field"><span class="field-label">Amount</span><span>₹ ${data['payment-amount'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Mode</span><span>${data['payment-mode-type'] || ''}</span></div>
        <div class="review-field"><span class="field-label">Cheque/DD/UTR No.</span><span>${data['cheque-no'] || ''}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">Application Source</p>
          <button type="button" class="review-edit-btn" onclick="KonnarkForm.showStep(5)">✏️ Edit</button>
        </div>
        <div class="review-field"><span class="field-label">Source</span><span>${Array.isArray(data['app-source']) ? data['app-source'].join(', ') : (data['app-source'] || '')}</span></div>
        <div class="review-field"><span class="field-label">Referred by</span><span>${data['referred-by'] || ''}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">KYC Attachments</p>
          <button type="button" class="review-edit-btn" onclick="KonnarkForm.showStep(6)">✏️ Edit</button>
        </div>
        <div class="review-field"><span class="field-label">Aadhaar Card</span><span>${hasAadhaar ? '✓ Attached' : 'Not Attached'}</span></div>
        <div class="review-field"><span class="field-label">PAN Card</span><span>${hasPAN ? '✓ Attached' : 'Not Attached'}</span></div>
      </div>

      <div class="review-section" style="border: 1px solid rgba(201,169,110,0.3); border-radius: 8px; padding: 0.85rem; background: rgba(201,169,110,0.04);">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;color:#C9A96E;font-weight:700;">🤝 Deal Confirmation Terms</p>
          <button type="button" class="review-edit-btn" style="background:#C9A96E;color:#0a0f1e;font-weight:700;" onclick="KonnarkForm.showStep(7)">✏️ Edit Deal</button>
        </div>
        <div class="review-field"><span class="field-label">Unit No.</span><span>${data['cs-unit-no'] || data['flat-no'] || '—'}</span></div>
        <div class="review-field"><span class="field-label">Configuration</span><span>${data['cs-configuration'] || '—'}</span></div>
        <div class="review-field"><span class="field-label">Usable Area</span><span>${data['cs-usable-area'] ? data['cs-usable-area'] + ' sq.ft.' : '—'}</span></div>
        <div class="review-field"><span class="field-label">Amount Agreed</span><span style="font-weight:700;color:#C9A96E;">${data['deal-amount-agreed'] ? '₹ ' + data['deal-amount-agreed'] : (data['payment-amount'] ? '₹ ' + data['payment-amount'] : '—')}</span></div>
        <div class="review-field"><span class="field-label">Car Parking in Stack Mechanism</span><span>${data['cs-parking'] || data['deal-parking'] || '—'}</span></div>
        <div class="review-field"><span class="field-label">Maintenance 1 Yr (Excl. at Possession)</span><span>${data['cs-maintenance'] || data['deal-maintenance'] ? (String(data['cs-maintenance'] || data['deal-maintenance']).startsWith('₹') ? (data['cs-maintenance'] || data['deal-maintenance']) : '₹ ' + (data['cs-maintenance'] || data['deal-maintenance'])) : '—'}</span></div>
        <div class="review-field"><span class="field-label">Society Formation (Excl. at Possession)</span><span>${data['cs-society-formation'] || data['deal-society-formation'] ? (String(data['cs-society-formation'] || data['deal-society-formation']).startsWith('₹') ? (data['cs-society-formation'] || data['deal-society-formation']) : '₹ ' + (data['cs-society-formation'] || data['deal-society-formation'])) : '—'}</span></div>
        <div class="review-field"><span class="field-label">Payment Terms / Remarks</span><span>${data['deal-payment-terms'] || '—'}</span></div>
      </div>

      <div class="review-section">
        <div class="review-section-header">
          <p class="subsection-title" style="margin-bottom:0;">Signature Method</p>
        </div>
        <div class="review-field">
          <span class="field-label">Selected Mode</span>
          <span>${data.sigMode === 'digital' ? (data.applicantSignature ? '✍️ Digital Signature (Signed & Ready)' : '✍️ Digital Signature (Pending - Sign Below)') : '📝 Manual Signature (Blank line on printed PDF)'}</span>
        </div>
        ${data.sigMode === 'digital' && data.applicantSignature ? `
          <div style="margin-top:0.5rem;display:flex;align-items:center;gap:0.75rem;">
            <span class="field-label" style="font-size:0.75rem;">Preview:</span>
            <img src="${data.applicantSignature}" alt="Signature Preview" style="height:32px;border:1px solid #1e2e4a;border-radius:4px;background:#fff;padding:2px 8px;object-fit:contain;">
          </div>
        ` : ''}
      </div>
    `;
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const colors = { info: '#C9A96E', success: '#5ce07a', error: '#e05c5c', warning: '#e0a05c' };
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
      background: #1a2540; border: 1px solid ${colors[type] || colors.info};
      color: #F0EDE8; padding: 0.75rem 1.5rem; border-radius: 8px;
      font-size: 0.875rem; z-index: 9999; max-width: 90vw; text-align: center;
      animation: toastIn 0.3s ease forwards; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function clearForm() {
    if (!config) return;
    try { localStorage.removeItem(`konnark_form_${config.projectId}`); } catch (e) {}
    window._aadhaarImageURL = null;
    window._panImageURL = null;
    window._applicantSignatureURL = null;
    formData = {};
    formNo = generateFormNo(config.formPrefix);
    formData = { formNo, projectId: config.projectId };

    const formNoEl = document.getElementById('form-number');
    if (formNoEl) formNoEl.textContent = formNo;

    const dateEl = document.getElementById('form-date');
    if (dateEl) dateEl.value = todayISO();

    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else if (el.id !== 'form-date') {
        el.value = '';
      }
    });

    const manualRadio = document.querySelector('input[name="sig-mode"][value="manual"]');
    if (manualRadio) manualRadio.checked = true;
    const sigContainer = document.getElementById('digital-sig-container');
    if (sigContainer) sigContainer.style.display = 'none';
    const canvas = document.getElementById('signature-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const sigPh = document.getElementById('sig-canvas-placeholder');
    if (sigPh) sigPh.style.display = 'flex';

    document.querySelectorAll('.ocr-preview').forEach(el => { el.src = ''; el.style.display = 'none'; });
    document.querySelectorAll('.ocr-status').forEach(el => { el.textContent = ''; el.className = 'ocr-status'; });
    currentStep = 0;
    showStep(0);
    showToast('Form cleared. Ready for new booking!', 'info');
  }

  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(toastStyle);

  return { init, nextStep, prevStep, showStep, showToast, clearForm, collectAllFormData, saveToStorage };
})();
