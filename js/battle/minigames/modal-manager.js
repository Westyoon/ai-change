(function () {
    const overlay = document.createElement('div');
    overlay.className = 'mg-modal-overlay hidden';
    overlay.innerHTML = `
    <div class="mg-modal-box">
      <button type="button" class="mg-modal-close" aria-label="닫기">×</button>
      <div class="mg-modal-content"></div>
    </div>
  `;
    document.body.appendChild(overlay);

    const contentEl = overlay.querySelector('.mg-modal-content');
    const closeBtn = overlay.querySelector('.mg-modal-box .mg-modal-close');

    let closable = true;
    let onCloseCallback = null;

    function open() {
        overlay.classList.remove('hidden');
    }

    function close() {
        overlay.classList.add('hidden');
        contentEl.innerHTML = '';
        const cb = onCloseCallback;
        onCloseCallback = null;
        if (typeof cb === 'function') cb();
    }

    function setClosable(value) {
        closable = value;
        closeBtn.style.display = value ? '' : 'none';
    }

    function getContent() {
        return contentEl;
    }

    function onClose(callback) {
        onCloseCallback = callback;
    }

    closeBtn.addEventListener('click', () => {
        if (closable) close();
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay && closable) close();
    });

    window.ModalManager = {
        open,
        close,
        setClosable,
        getContent,
        onClose,
    };
})();