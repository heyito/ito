document.addEventListener('DOMContentLoaded', function() {
    const statusDiv = document.getElementById('status');
    
    // Check connection status
    chrome.runtime.sendMessage({type: 'checkConnection'}, function(response) {
        if (response && response.connected) {
            statusDiv.textContent = 'Status: Connected';
            statusDiv.className = 'status connected';
        } else {
            statusDiv.textContent = 'Status: Disconnected';
            statusDiv.className = 'status disconnected';
        }
    });
}); 