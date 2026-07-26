// f:\projects\booking form konnark\shared\config.js
// Project-specific configuration for Konnark booking forms

const KONNARK_CONFIGS = {
  stellar: {
    projectId: 'stellar',
    projectName: 'Konnark Stellar',
    projectTitle: 'STELLAR',
    company: 'Konnark Stays Pvt. Ltd.',
    rera: 'P52000080382',
    location: 'Navi Mumbai',
    jurisdiction: 'Panvel',
    typologyOptions: ['1 BHK'],
    formPrefix: 'KS',
    accentColor: '#C9A96E',
    promoterBank: {
      accountName: 'KONNARK STAYS RERA DESIGNATED COLLECTION ACCOUNT FOR KONNARK STELLAR',
      accountNo: '0183102000035671',
      bank: 'IDBI Bank',
      branch: 'CBD Belapur',
      ifsc: 'IBKL0000183'
    },
    termsCompany: 'Konnark Stays',
    termsAgreement: 'Konnark Stellar Standard format'
  },
  orion: {
    projectId: 'orion',
    projectName: 'Konnark Orion',
    projectTitle: 'ORION',
    company: 'Konnark Macrohomes LLP',
    rera: '[To Be Updated]',
    location: 'Navi Mumbai',
    jurisdiction: 'Panvel',
    typologyOptions: ['Mini 2 BHK', '2 BHK'],
    formPrefix: 'KO',
    accentColor: '#C9A96E',
    promoterBank: {
      accountName: '[To Be Updated]',
      accountNo: '[To Be Updated]',
      bank: '[To Be Updated]',
      branch: '[To Be Updated]',
      ifsc: '[To Be Updated]'
    },
    termsCompany: 'Konnark Macrohomes LLP',
    termsAgreement: 'Konnark Orion Standard format'
  }
};

// Generate form number
function generateFormNo(prefix) {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${year}-${seq}`;
}

// Format date DD/MM/YYYY
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Get today's date in YYYY-MM-DD format (for date inputs)
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// Get current time as HH:MM
function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}
