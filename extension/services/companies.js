// Storage keys
const STORAGE_KEY = 'socialAnalytics_companies';
const SELECTED_COMPANY_KEY = 'socialAnalytics_selectedCompany';

// Get companies from storage
export const getCompanies = async () => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
};

// Get selected company
export const getSelectedCompany = async () => {
  const result = await chrome.storage.local.get(SELECTED_COMPANY_KEY);
  return result[SELECTED_COMPANY_KEY] || null;
};

// Set selected company
export const setSelectedCompany = async (companyId) => {
  await chrome.storage.local.set({
    [SELECTED_COMPANY_KEY]: companyId
  });
};

// Add new company
export const addCompany = async (company) => {
  const companies = await getCompanies();
  
  const newCompany = {
    ...company,
    id: crypto.randomUUID(),
    createdAt: Date.now()
  };
  
  await chrome.storage.local.set({
    [STORAGE_KEY]: [...companies, newCompany]
  });
  
  return newCompany;
};

// Delete company
export const deleteCompany = async (id) => {
  const companies = await getCompanies();
  const selectedCompany = await getSelectedCompany();
  
  // If deleting selected company, clear selection
  if (selectedCompany === id) {
    await setSelectedCompany(null);
  }
  
  await chrome.storage.local.set({
    [STORAGE_KEY]: companies.filter(c => c.id !== id)
  });
};

// Delete all companies
export const deleteAllCompanies = async () => {
  await chrome.storage.local.set({
    [STORAGE_KEY]: []
  });
  await setSelectedCompany(null);
};

// Render company list
export const renderCompanyList = async () => {
  const companies = await getCompanies();
  const selectedCompanyId = await getSelectedCompany();
  const listElement = document.querySelector('.company-list');
  
  if (!listElement) return;
  
  listElement.innerHTML = companies.map(company => `
    <div class="company-item" data-id="${company.id}" style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 8px;
      cursor: pointer;
      ${selectedCompanyId === company.id ? 'border: 2px solid #2563eb;' : ''}
    ">
      <div style="
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1;
      ">
        ${company.logoUrl ? `
          <img 
            src="${company.logoUrl}" 
            alt="${company.name}" 
            style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              object-fit: cover;
            "
          />
        ` : `
          <div style="
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <span style="
              color: #6b7280;
              font-size: 18px;
            ">${company.name.charAt(0)}</span>
          </div>
        `}
        <div style="flex: 1;">
          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <h3 style="
              font-size: 14px;
              font-weight: 500;
              color: #111827;
              margin: 0 0 4px 0;
            ">${company.name}</h3>
            ${selectedCompanyId === company.id ? `
              <span style="
                background: #2563eb;
                color: white;
                padding: 2px 8px;
                border-radius: 9999px;
                font-size: 12px;
              ">Selected</span>
            ` : ''}
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <a 
              href="${company.linkedInUrl}" 
              target="_blank"
              style="
                font-size: 12px;
                color: #2563eb;
                text-decoration: none;
              "
              onmouseover="this.style.color='#1d4ed8'"
              onmouseout="this.style.color='#2563eb'"
            >
              View on LinkedIn
            </a>
            ${company.context ? `
              <div 
                class="context-preview"
                style="
                  font-size: 12px;
                  color: #6b7280;
                  position: relative;
                "
                title="${company.context}"
              >
                ${company.context.length > 25 
                  ? company.context.substring(0, 25) + '...' 
                  : company.context}
                ${company.context.length > 25 ? `
                  <div 
                    class="context-tooltip"
                    style="
                      display: none;
                      position: absolute; 
                      bottom: 100%;
                      left: 0;
                      background: white;
                      border: 1px solid #e5e7eb;
                      border-radius: 6px;
                      padding: 4px;
                      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 
                        0.1);
                      margin-bottom: 8px;
                      z-index: 10;
                      white-space: pre-wrap;
                      word-wrap: break-word;
                    "
                  >
                    ${company.context.match(/.{1,50}/g).join('\n')}
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
      <button 
        class="delete-company-btn"
        aria-label="Delete company"
        style="
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          color: #dc2626;
        "
        onmouseover="this.style.color='#b91c1c'"
        onmouseout="this.style.color='#dc2626'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  `).join('');

  // Add hover listeners for context tooltips
  listElement.querySelectorAll('.context-preview').forEach(preview => {
    const tooltip = preview.querySelector('.context-tooltip');
    if (tooltip) {
      preview.addEventListener('mouseenter', () => {
        tooltip.style.display = 'block';
      });
      preview.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });
    }
  });
};
