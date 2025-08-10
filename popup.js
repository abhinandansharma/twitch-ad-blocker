document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleButton');

    // Get current status from background
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response && response.status) {
            updateUI(response.status);
        }
    });

    toggleButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'toggleRules' }, (response) => {
            if (response && response.status) {
                updateUI(response.status);
            }
        });
    });

    function updateUI(status) {
        if (status === 'active') {
            toggleButton.textContent = 'Disable Ad Blocker';
            toggleButton.classList.add('active');
            toggleButton.classList.remove('inactive');
        } else {
            toggleButton.textContent = 'Enable Ad Blocker';
            toggleButton.classList.add('inactive');
            toggleButton.classList.remove('active');
        }
    }
});
