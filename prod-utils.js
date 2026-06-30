// ==========================================
// MediFinder Production Utilities v2.0
// Error handling, validation, security, UX
// ==========================================

const MedUtils = {
  // --- SECURITY: XSS Protection ---
  sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  escapeAttr(str) {
    return str.replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;')
              .replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  // --- INPUT VALIDATION ---
  validators: {
    email(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Invalid email address';
    },
    phone(v) {
      return /^[6-9]\d{9}$/.test(v.replace(/\s/g,'')) ? null : 'Invalid 10-digit phone number';
    },
    password(v) {
      if (v.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(v)) return 'Must include an uppercase letter';
      if (!/[a-z]/.test(v)) return 'Must include a lowercase letter';
      if (!/[0-9]/.test(v)) return 'Must include a number';
      return null;
    },
    name(v) {
      return v.trim().length >= 2 ? null : 'Name must be at least 2 characters';
    },
    required(v, label) {
      return v && v.trim() ? null : `${label || 'This field'} is required`;
    },
    price(v) {
      const n = parseFloat(v);
      return !isNaN(n) && n > 0 ? null : 'Enter a valid price';
    },
    pincode(v) {
      return /^\d{6}$/.test(v) ? null : 'Enter a valid 6-digit pincode';
    }
  },

  validateField(value, rules) {
    for (const rule of rules) {
      const error = rule(value);
      if (error) return error;
    }
    return null;
  },

  // --- TOAST NOTIFICATION SYSTEM ---
  toast(message, type = 'info', duration = 3000) {
    const existing = document.querySelector('.mf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'mf-toast';
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const colors = { success: '#2ed573', error: '#e02020', info: '#1c82aa', warning: '#f0a500' };

    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}" style="color:${colors[type]};font-size:1.1rem;"></i>
      <span>${this.sanitizeHTML(message)}</span>
    `;

    Object.assign(toast.style, {
      position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%) translateY(20px)',
      background: '#fff', color: '#1a1a2e', padding: '12px 20px', borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: '99999', display: 'flex',
      alignItems: 'center', gap: '10px', fontSize: '0.88rem', fontWeight: '600',
      maxWidth: '90%', opacity: '0', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      fontFamily: "'Inter', sans-serif", border: `1px solid ${colors[type]}20`
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // --- LOADING SPINNER ---
  showLoading(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="mf-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;">
        <div class="mf-spinner"></div>
        <span style="color:#747d8c;font-size:0.85rem;font-weight:500;">Loading...</span>
      </div>
    `;
  },

  hideLoading(container) {
    const spinner = container?.querySelector('.mf-loading');
    if (spinner) spinner.remove();
  },

  // --- SKELETON LOADING ---
  showSkeleton(container, count = 4) {
    if (!container) return;
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="mf-skeleton-card" style="background:#fff;border-radius:16px;padding:16px;border:1px solid #f1f2f6;">
          <div class="mf-skeleton" style="width:60px;height:60px;border-radius:12px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;"></div>
          <div class="mf-skeleton" style="height:14px;width:70%;border-radius:6px;margin-top:12px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;"></div>
          <div class="mf-skeleton" style="height:12px;width:50%;border-radius:6px;margin-top:8px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;"></div>
        </div>
      `;
    }
    container.innerHTML = html;

    if (!document.getElementById('mf-skeleton-style')) {
      const style = document.createElement('style');
      style.id = 'mf-skeleton-style';
      style.textContent = '@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
      document.head.appendChild(style);
    }
  },

  // --- ERROR BOUNDARY ---
  handleError(error, context = 'App') {

    this.toast(`${context} error. Please try again.`, 'error');
  },

  async safeAsync(fn, context = 'Operation') {
    try {
      return await fn();
    } catch (error) {
      this.handleError(error, context);
      return null;
    }
  },

  // --- FORMAT HELPERS ---
  formatCurrency(amount) {
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  timeAgo(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return this.formatDate(dateStr);
  },

  // --- PERFORMANCE: Debounce ---
  debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // --- PERFORMANCE: Throttle ---
  throttle(fn, limit = 200) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // --- LAZY LOADING ---
  initLazyLoad() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
            }
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '100px' });

      document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
    }
  },

  // --- NETWORK STATUS ---
  isOnline() {
    return navigator.onLine;
  },

  initNetworkListener() {
    window.addEventListener('online', () => this.toast('Back online!', 'success'));
    window.addEventListener('offline', () => this.toast('You are offline', 'warning', 5000));
  },

  // --- PWA: Service Worker Registration ---
  async registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js?v=13');
        // Force SW update to pick up latest cached files
        reg.update().catch(() => {});

      } catch (err) {

      }
    }
  }
};

// Auto-inject skeleton spinner CSS
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .mf-spinner {
      width: 40px; height: 40px; border: 3px solid #f1f2f6;
      border-top-color: #e02020; border-radius: 50%;
      animation: mfSpin 0.8s linear infinite;
    }
    @keyframes mfSpin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  MedUtils.initLazyLoad();
  MedUtils.initNetworkListener();
  MedUtils.registerSW();
  if (document.querySelector('.merchant-page, [data-page="merchant"]') || location.pathname.includes('marchent')) {
    loadMerchantNotifications();
  }
});

// --- GLOBAL TOAST NOTIFICATION (bottom-right, slide-up, auto-dismiss) ---
function showToast(message, type = 'info') {
  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column-reverse;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const colors = { success: '#2ed573', error: '#e02020', info: '#1c82aa', warning: '#f0a500' };
  const bgColors = { success: '#e3faf2', error: '#fff3f3', info: '#e8f4fd', warning: '#fff8e1' };
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-exclamation-triangle' };

  const toast = document.createElement('div');
  toast.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:10px;background:${bgColors[type] || bgColors.info};color:#1a1a2e;padding:12px 18px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.12);font-size:0.88rem;font-weight:600;font-family:'Inter',system-ui,sans-serif;border-left:4px solid ${colors[type] || colors.info};opacity:0;transform:translateY(20px);transition:all 0.3s cubic-bezier(0.4,0,0.2,1);max-width:340px;`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}" style="color:${colors[type] || colors.info};font-size:1rem;flex-shrink:0;"></i><span>${MedUtils.sanitizeHTML(message)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Shared merchant notification loader
async function loadMerchantNotifications() {
  try {
    if (typeof supabase === 'undefined' || !supabase) return;
    const merchantId = localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
    if (!merchantId) return;
    const { data } = await supabase.from('merchant_notifications')
      .select('id, title, message, type, is_read, created_at')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })
      .limit(20);
    const badge = document.getElementById('notifBadge');
    if (badge && data) {
      const unread = data.filter(n => !n.is_read).length;
      badge.textContent = unread || '';
      badge.style.display = unread > 0 ? '' : 'none';
    }
    return data || [];
  } catch(e) { return []; }
}

// Shared merchant notification bell click handler
async function showMerchantNotifications() {
  const notifs = await loadMerchantNotifications();
  if (!notifs || notifs.length === 0) {
    showToast('No new notifications', 'info');
    return;
  }
  const unread = notifs.filter(n => !n.is_read);
  if (unread.length === 0) {
    showToast('No new notifications', 'info');
    return;
  }
  const latest = unread[0];
  showToast(latest.title + ': ' + latest.message, latest.type || 'info');
}

function showConfirmationModal(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="width:48px;height:48px;border-radius:50%;background:#fff2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
        <i class="fa-solid fa-circle-question" style="color:#e02020;font-size:24px;"></i>
      </div>
      <p style="margin:0 0 20px;font-size:0.95rem;color:#333;font-weight:500;line-height:1.5;">${message}</p>
      <div style="display:flex;gap:10px;">
        <button id="_cm_cancel" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;font-weight:600;color:#666;font-size:0.9rem;">Cancel</button>
        <button id="_cm_confirm" style="flex:1;padding:12px;border:none;border-radius:10px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;font-size:0.9rem;">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_cm_confirm').onclick = () => { overlay.remove(); if (onConfirm) onConfirm(); };
  overlay.querySelector('#_cm_cancel').onclick = () => { overlay.remove(); if (onCancel) onCancel(); };
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); } };
}
