// grammar_checker/static/js/editor.js
let tooltip;
let activeEditor = null;
let typingTimer;
const DONE_TYPING_INTERVAL = 800;
let currentErrors = [];

function getCSRFToken() {
    const tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
    return tokenInput ? tokenInput.value : "";
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("Grammarly-like Grammar Checker Loaded");
    createTooltipElement();

    tinymce.init({
        selector: '#editor',
        height: 500,
        menubar: false,
        plugins: 'lists link wordcount fullscreen code',
        toolbar: 'undo redo | bold italic underline | bullist numlist | code | fullscreen',
        branding: false,
        statusbar: true,
        content_style: `
            body { 
                font-family: 'Segoe UI', sans-serif; 
                font-size: 16px; 
                line-height: 1.8;
                padding: 20px;
            }
            .grammar-error { 
                border-bottom: 2.5px solid #dc3545;
                background-color: rgba(220, 53, 69, 0.1);
                cursor: pointer;
                padding: 1px 0;
                border-radius: 2px;
                transition: background-color 0.2s;
            }
            .grammar-error:hover {
                background-color: rgba(220, 53, 69, 0.2);
            }
        `,
        setup: function(editor) {
            activeEditor = editor;

            // Auto check on typing
            editor.on('keyup', function(e) {
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    performGrammarCheck();
                }, DONE_TYPING_INTERVAL);
            });

            // QUAN TRỌNG: Click event phải bind vào editor body
            editor.on('init', function() {
                const editorBody = editor.getBody();

                // Sử dụng event delegation
                editorBody.addEventListener('click', function(e) {
                    console.log("🖱️ Clicked on:", e.target);

                    // Tìm span.grammar-error gần nhất
                    let target = e.target;
                    if (!target.classList.contains('grammar-error')) {
                        target = target.closest('.grammar-error');
                    }

                    if (target && target.classList.contains('grammar-error')) {
                        console.log("Clicked on error span");
                        e.preventDefault();
                        e.stopPropagation();

                        const errorIndex = parseInt(target.dataset.errorIndex);
                        const original = target.dataset.original;
                        const suggestion = target.dataset.suggestion;
                        const message = target.dataset.message;
                        const errorType = target.dataset.errorType;

                        console.log("Error data:", {errorIndex, original, suggestion, message, errorType});

                        // Lấy vị trí của span trong viewport
                        const rect = target.getBoundingClientRect();
                        const iframe = editor.getContainer().querySelector('iframe');
                        const iframeRect = iframe.getBoundingClientRect();

                        showTooltip(
                            target,
                            rect.left + iframeRect.left,
                            rect.bottom + iframeRect.top,
                            original,
                            suggestion,
                            message,
                            errorType
                        );
                    } else {
                        hideTooltip();
                    }
                });

                updateStatusBar(0);
            });

            // Hide tooltip on keydown
            editor.on('keydown', () => hideTooltip());
        }
    });

    // Click outside to hide tooltip
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.grammar-tooltip')) {
            hideTooltip();
        }
    });
});

async function performGrammarCheck() {
    if (!activeEditor) return;

    const text = activeEditor.getContent({format: 'text'}).trim();
    if (!text || text.length < 3) {
        currentErrors = [];
        updateStatusBar(0);
        clearAllHighlights();
        return;
    }

    try {
        console.log("Checking grammar...");
        updateStatusBar(-1);

        const response = await fetch('/api/check/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({text: text})
        });

        const data = await response.json();

        if (data.errors && data.errors.length > 0) {
            currentErrors = data.errors;
            console.log(`Found ${data.errors.length} errors:`, data.errors);
            highlightErrors(data.errors);
            updateStatusBar(data.errors.length);
        } else {
            currentErrors = [];
            clearAllHighlights();
            updateStatusBar(0);
            console.log("No errors found");
        }

        if (data.request_id) {
            showExportButtons(data.request_id);
        }

    } catch (err) {
        console.error("API Error:", err);
        updateStatusBar(0);
    }
}

function highlightErrors(errors) {
    const editor = activeEditor;
    const bookmark = editor.selection.getBookmark(2, true);

    clearAllHighlights();

    let content = editor.getContent();
    const plainText = editor.getContent({format: 'text'});

    console.log("=" * 50);
    console.log("Starting to highlight errors");
    console.log("Plain text:", plainText);
    console.log("Total errors:", errors.length);

    errors.forEach((err, index) => {
        const original = err.original;

        // QUAN TRỌNG: Kiểm tra suggestions có đúng format không
        let suggestion = '';
        if (Array.isArray(err.suggestions) && err.suggestions.length > 0) {
            suggestion = err.suggestions[0];
        } else if (typeof err.suggestion === 'string') {
            // Nếu API trả về "suggestion" thay vì "suggestions"
            suggestion = err.suggestion;
        }

        console.log(`Error ${index}:`, {
            original: original,
            suggestion: suggestion,
            message: err.message,
            type: err.type
        });

        if (!original || !suggestion) {
            console.warn(`Skipping error ${index}: missing original or suggestion`);
            return;
        }

        content = highlightTextInHTML(
            content,
            original,
            suggestion,
            err.message || 'Grammar error',
            err.type || 'grammar',
            index
        );
    });

    console.log("Highlighting complete");
    console.log("=" * 50);

    editor.setContent(content);
    editor.selection.moveToBookmark(bookmark);
}

function highlightTextInHTML(htmlContent, textToHighlight, suggestion, message, errorType, errorIndex) {
    // 1. Escape các ký tự đặc biệt trong từ khóa tìm kiếm
    const escapedText = textToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 2. Tạo Pattern tìm kiếm (cho phép tìm xuyên qua thẻ in đậm/nghiêng)
    const wordSeparator = '(?:\\s+|&nbsp;|<[^>]+>)+';
    const searchPattern = escapedText.split(/\s+/).join(wordSeparator);

    // 3. REGEX AN TOÀN:
    // Nhóm 1 (<[^>]+>): Bắt các thẻ HTML (để bỏ qua chúng)
    // Nhóm 2 (${searchPattern}): Bắt nội dung text thực sự cần highlight
    const regex = new RegExp(`(<[^>]+>)|(${searchPattern})`, 'gi');

    // 4. Thực hiện thay thế có chọn lọc
    return htmlContent.replace(regex, function(match, tagMatch, textMatch) {
        // ƯU TIÊN TUYỆT ĐỐI: Nếu là thẻ HTML (ví dụ: <div>, <strong>, title="...") -> Giữ nguyên
        if (tagMatch) {
            return tagMatch;
        }

        // Chỉ khi là text thực sự mới bọc thẻ lỗi
        if (textMatch) {
            return `<span class="grammar-error" 
                data-original="${escapeHtml(textToHighlight)}" 
                data-suggestion="${escapeHtml(suggestion)}" 
                data-message="${escapeHtml(message)}" 
                data-error-type="${errorType}"
                data-error-index="${errorIndex}"
                title="${escapeHtml(message)}">${match}</span>`;
        }

        return match;
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearAllHighlights() {
    if (!activeEditor) return;
    let content = activeEditor.getContent();
    content = content.replace(/<span[^>]*class="grammar-error"[^>]*>(.*?)<\/span>/gi, '$1');
    activeEditor.setContent(content);
}

// === TOOLTIP SYSTEM ===

function createTooltipElement() {
    tooltip = document.createElement('div');
    tooltip.className = 'grammar-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-header">
            <div class="error-title">Grammar Error</div>
            <div class="error-type"></div>
        </div>
        <div class="tooltip-body">
            <div class="original-text"></div>
            <div class="arrow">→</div>
            <button class="suggestion-btn" id="apply-fix-btn"></button>
        </div>
        <button class="dismiss-btn">Ignore</button>
    `;
    document.body.appendChild(tooltip);

    tooltip.querySelector('.dismiss-btn').onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
    };

    tooltip.querySelector('#apply-fix-btn').onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        applyFix();
    };
}

let currentErrorSpan = null;

function showTooltip(targetSpan, x, y, original, suggestion, message, errorType) {
    console.log("📌 Showing tooltip");
    console.log("  Suggestion:", suggestion);

    if (!suggestion || suggestion.trim() === '') {
        console.error("❌ ERROR: Suggestion is empty!");
        return;
    }

    currentErrorSpan = targetSpan;

    // Update content
    tooltip.querySelector('.error-title').innerText = message || "Grammar Error";
    tooltip.querySelector('.error-type').innerText = errorType ? `TYPE: ${errorType.toUpperCase()}` : '';

    // Set suggestion button text
    const suggestionBtn = tooltip.querySelector('#apply-fix-btn');
    suggestionBtn.innerText = suggestion;
    suggestionBtn.style.display = 'flex';

    // === VỊ TRÍ SÁT NGAY DƯỚI LỖI ===

    const spanRect = targetSpan.getBoundingClientRect();

    // Tooltip width
    const tooltipWidth = 320;

    // VỊ TRÍ Y: Sát ngay dưới lỗi (0px gap)
    let top = spanRect.bottom + window.scrollY;

    // VỊ TRÍ X: Căn trái với từ lỗi
    let left = spanRect.left + window.scrollX;

    // Đảm bảo không tràn màn hình
    if (left < 10) {
        left = 10;
    }
    if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
    }

    // Set position
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.display = 'block';

    console.log("✅ Tooltip displayed at:", { top, left });
}

function hideTooltip() {
    if (tooltip) {
        tooltip.style.display = 'none';
    }
    currentErrorSpan = null;
}

// Sửa hàm applyFix trong editor.js

function applyFix() {
    console.log("Applying fix");

    if (!currentErrorSpan || !activeEditor) {
        console.log("No error span selected");
        return;
    }

    const suggestion = currentErrorSpan.dataset.suggestion;
    const errorIndex = parseInt(currentErrorSpan.dataset.errorIndex);

    console.log("Replacing with:", suggestion);

    // --- BẮT ĐẦU PHẦN SỬA ĐỔI (Sử dụng DOM Replace thay vì Selection) ---

    // Sử dụng UndoManager để đảm bảo người dùng có thể Ctrl+Z lại được
    activeEditor.undoManager.transact(function() {
        // Tạo một node văn bản mới từ gợi ý (suggestion)
        // createFragment giúp xử lý an toàn nếu suggestion có chứa ký tự đặc biệt
        const newContent = activeEditor.dom.createFragment(suggestion);

        // Lệnh này sẽ tìm thẻ currentErrorSpan trong editor
        // và thay thế HOÀN TOÀN nó bằng nội dung mới
        activeEditor.dom.replace(newContent, currentErrorSpan);
    });

    // --- KẾT THÚC PHẦN SỬA ĐỔI ---

    // Cập nhật lại trạng thái mảng lỗi
    if (!isNaN(errorIndex) && currentErrors[errorIndex]) {
        currentErrors[errorIndex] = null;
        const remainingErrors = currentErrors.filter(e => e !== null).length;
        updateStatusBar(remainingErrors);
    }

    hideTooltip();
    console.log("Fix applied via DOM Replace");

    // Xử lý highlight lại các lỗi còn lại
    const activeErrors = currentErrors.filter(e => e !== null);

    if (activeErrors.length > 0) {
        clearAllHighlights();
        highlightErrors(activeErrors);
        currentErrors = activeErrors;
    } else {
        console.log("All errors fixed!");
        clearAllHighlights();
        currentErrors = [];
        updateStatusBar(0);
    }
}

function updateStatusBar(errorCount) {
    const statusbar = document.querySelector('.tox-statusbar__text-container');
    if (!statusbar) return;

    let statusHTML = '';

    if (errorCount === -1) {
        statusHTML = '<span style="color: #17a2b8; font-weight: 600;">Checking grammar...</span>';
    } else if (errorCount === 0) {
        statusHTML = '<span style="color: #28a745; font-weight: 600;">No grammar errors found</span>';
    } else {
        statusHTML = `<span style="color: #dc3545; font-weight: 700;">${errorCount} error${errorCount > 1 ? 's' : ''} found</span>`;
    }

    const existingStatus = statusbar.querySelector('.grammar-status');
    if (existingStatus) {
        existingStatus.innerHTML = statusHTML;
    } else {
        const statusElement = document.createElement('div');
        statusElement.className = 'grammar-status';
        statusElement.innerHTML = statusHTML;
        statusElement.style.marginRight = '15px';
        statusbar.insertBefore(statusElement, statusbar.firstChild);
    }
}

function showExportButtons(requestId) {
    const box = document.getElementById('export-actions');
    const pdf = document.getElementById('export-pdf');
    const docx = document.getElementById('export-docx');

    if (box && pdf && docx) {
        box.style.display = 'block';
        pdf.href = `/export/pdf/${requestId}/`;
        docx.href = `/export/docx/${requestId}/`;
    }
}

// === FILE UPLOAD ===

document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
});

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    event.target.value = '';

    const formData = new FormData();
    formData.append('file', file);

    if (activeEditor) {
        activeEditor.setContent('<p><em>Reading file...</em></p>');
    }

    try {
        const response = await fetch('/api/upload/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken()
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            if (activeEditor) {
                const formattedText = data.text.replace(/\n/g, '<br>');
                activeEditor.setContent(formattedText);
                setTimeout(performGrammarCheck, 1000);
            }
        } else {
            alert("Upload error: " + data.error);
            if (activeEditor) activeEditor.setContent('');
        }

    } catch (err) {
        console.error("Error:", err);
        alert("An error occurred while uploading the file.");
    }
}