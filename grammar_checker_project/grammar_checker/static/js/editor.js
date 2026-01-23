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

document.addEventListener('DOMContentLoaded', function () {
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
        setup: function (editor) {
            activeEditor = editor;

            // Auto check on typing
            editor.on('keyup', function (e) {
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    performGrammarCheck();
                }, DONE_TYPING_INTERVAL);
            });

            // QUAN TRỌNG: Click event phải bind vào editor body
            editor.on('init', function () {
                const editorBody = editor.getBody();

                // Sử dụng event delegation
                editorBody.addEventListener('click', function (e) {
                    console.log("Clicked on:", e.target);

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

    // Lấy nội dung text thuần túy để kiểm tra
    const text = activeEditor.getContent({format: 'text'}).trim();

    console.log("Text to check:", text); // Debug log
    console.log("Text length before sending to /api/check/:", text.length); // NEW DEBUG LOG

    if (!text || text.length < 3) {
        console.log("Text too short or empty, skipping check.");
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
        console.log("Response status from /api/check/:", response.status); // NEW DEBUG LOG
        console.log("Response data from /api/check/:", data); // NEW DEBUG LOG

        if (!response.ok) {
            // Xử lý lỗi từ server trả về (ví dụ 400 Bad Request)
            console.error("Server Error:", data);
            if (data.error) {
                alert("Lỗi: " + data.error); // Hiển thị lỗi cho người dùng biết (ví dụ quá 1500 từ)
            } else {
                alert("Đã xảy ra lỗi khi kiểm tra ngữ pháp. Mã lỗi: " + response.status);
            }
            updateStatusBar(0);
            return;
        }

        if (data.errors && data.errors.length > 0) {
            currentErrors = data.errors;
            console.log(`Found ${data.errors.length} errors:`, data.errors);
            highlightErrors(data.errors);
            countAndDisplayErrors();
        } else {
            currentErrors = [];
            clearAllHighlights();
            updateStatusBar(0);
            console.log("No errors found");
        }

        if (data.request_id) {
            showActionButtons(data.request_id);
        }

    } catch (err) {
        console.error("API Error:", err);
        alert("Đã xảy ra lỗi mạng hoặc lỗi không xác định khi gọi API kiểm tra ngữ pháp.");
        updateStatusBar(0);
    }
}

function highlightErrors(errors) {
    const editor = activeEditor;
    const bookmark = editor.selection.getBookmark(2, true);
    clearAllHighlights();

    let content = editor.getContent();

    errors.forEach((err, index) => {
        const original = err.original;

        // Lấy suggestion chuẩn
        let suggestion = "";
        if (Array.isArray(err.suggestions) && err.suggestions.length > 0) {
            suggestion = err.suggestions[0];
        } else if (typeof err.suggestion === 'string') {
            suggestion = err.suggestion;
        }

        if (!original) {
            console.warn(`Skipping error ${index}: missing original`);
            return;
        }

        console.log(`Đang thử highlight lỗi: "${original}" -> "${suggestion}"`);
        content = highlightTextInHTML(content, original, suggestion, err.message, err.type, index);
    });

    editor.setContent(content);
    editor.selection.moveToBookmark(bookmark);
}

function highlightTextInHTML(htmlContent, textToHighlight, suggestion, message, errorType, errorIndex) {
    // 1. Tách từ khóa thành các phần dựa trên khoảng trắng
    const parts = textToHighlight.split(/\s+/);

    const regexParts = parts.map(part => {
        // 2. Escape các ký tự đặc biệt của Regex trong từ (như dấu chấm, dấu hỏi...)
        let esc = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 3. Xử lý các loại dấu nháy:
        // - '       : Nháy thẳng
        // - ’       : Nháy cong (Smart quote)
        // - &#39;   : Mã decimal nháy thẳng
        // - &#8217; : Mã decimal nháy cong
        // - &apos;  : Entity nháy thẳng
        // - &rsquo; : Entity nháy cong (TinyMCE rất hay dùng cái này!)
        esc = esc.replace(/['’]/g, "(?:['’]|&#39;|&#8217;|&apos;|&rsquo;)");

        return esc;
    });

    // 4. Nối các từ lại bằng mẫu separator (cho phép khoảng trắng, &nbsp; hoặc thẻ HTML xen giữa)
    const wordSeparator = '(?:\\s+|&nbsp;|<[^>]+>)+';
    const searchPattern = regexParts.join(wordSeparator);

    // 5. Tạo Regex:
    const regex = new RegExp(`(<[^>]+>)|(${searchPattern})`, 'gi');

    return htmlContent.replace(regex, function (match, tagMatch, textMatch) {
        // Nếu là thẻ HTML -> giữ nguyên
        if (tagMatch) {
            return tagMatch;
        }

        // Nếu là text khớp -> bọc span lỗi
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

    tooltip.querySelector('.dismiss-btn').onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
    };

    tooltip.querySelector('#apply-fix-btn').onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        applyFix();
    };
}

let currentErrorSpan = null;

function showTooltip(targetSpan, x, y, original, suggestion, message, errorType) {
    console.log("Showing tooltip");
    console.log("   Suggestion:", suggestion);

    currentErrorSpan = targetSpan;

    // Update content
    tooltip.querySelector('.error-title').innerText = message || "Grammar Error";
    tooltip.querySelector('.error-type').innerText = errorType ? `TYPE: ${errorType.toUpperCase()}` : '';

    // Set suggestion button text
    const suggestionBtn = tooltip.querySelector('#apply-fix-btn');
    if (!suggestion || suggestion.trim() === "") {
        suggestionBtn.innerText = "Remove '" + original + "'";
        suggestionBtn.style.background = "linear-gradient(135deg, #dc3545 0%, #c82333 100%)"; // Màu đỏ
        suggestionBtn.dataset.action = "remove"; // Đánh dấu là xóa
    } else {
        suggestionBtn.innerText = suggestion;
        suggestionBtn.style.background = "linear-gradient(135deg, #28a745 0%, #20c997 100%)"; // Màu xanh
        suggestionBtn.dataset.action = "replace";
    }
    suggestionBtn.style.display = 'flex';

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

    console.log("Tooltip:", {top, left});
}

function hideTooltip() {
    if (tooltip) {
        tooltip.style.display = 'none';
    }
    currentErrorSpan = null;
}

function applyFix() {
    console.log("Applying fix...");

    if (!currentErrorSpan || !activeEditor) {
        console.warn("No error span selected");
        return;
    }

    const suggestion = currentErrorSpan.dataset.suggestion;
    const errorIndex = parseInt(currentErrorSpan.dataset.errorIndex);
    const action = tooltip.querySelector('#apply-fix-btn').dataset.action;

    // BẮT ĐẦU SỬA
    activeEditor.undoManager.transact(function () {
        // 1. Chọn toàn bộ thẻ span bị lỗi
        activeEditor.selection.select(currentErrorSpan);

        // 2. Ghi đè nội dung
        if (action === "remove" || !suggestion) {
            activeEditor.selection.setContent(""); // Xóa
        } else {
            // Chèn text
            activeEditor.selection.setContent(activeEditor.dom.encode(suggestion));
        }
    });

    // Xử lý logic mảng lỗi
    if (!isNaN(errorIndex) && currentErrors[errorIndex]) {
        currentErrors[errorIndex] = null; // Đánh dấu đã sửa
    }

    hideTooltip();

    // Đếm lại số lỗi thực tế
    countAndDisplayErrors();
}

// Hàm mới để đếm chính xác số lỗi đang hiển thị
function countAndDisplayErrors() {
    if (!activeEditor) return;

    // Đếm số thẻ span lỗi thực tế trong editor
    const errorSpans = activeEditor.getBody().querySelectorAll('.grammar-error');
    const count = errorSpans.length;

    console.log(`Real error count in DOM: ${count}`);

    // Nếu hết lỗi thì tự động check lại
    if (count === 0 && currentErrors.length > 0) {
        console.log("All errors fixed! Triggering re-check...");
        clearAllHighlights();
        updateStatusBar(-1);
        setTimeout(() => {
            performGrammarCheck();
        }, 800);
    } else {
        updateStatusBar(count);
    }
}

function fixAllErrors() {
    if (!activeEditor) return;

    const editorBody = activeEditor.getBody();
    const errorSpans = editorBody.querySelectorAll('.grammar-error');

    if (errorSpans.length === 0) {
        alert("Không có lỗi nào để sửa!");
        return;
    }

    // Cập nhật thông báo xác nhận sang tiếng Việt
    if (!confirm(`Bạn có chắc chắn muốn tự động sửa tất cả ${errorSpans.length} lỗi không?`)) {
        return;
    }

    activeEditor.undoManager.transact(function () {
        // Duyệt ngược từ dưới lên để tránh làm lệch vị trí DOM khi thay thế
        for (let i = errorSpans.length - 1; i >= 0; i--) {
            const span = errorSpans[i];
            const suggestion = span.dataset.suggestion;

            // Nếu suggestion rỗng -> Xóa từ đó
            if (!suggestion || suggestion.trim() === "") {
                span.remove(); // Xóa thẻ span khỏi DOM
            } else {
                // Thay thế thẻ span bằng text suggestion
                const textNode = document.createTextNode(suggestion);
                span.parentNode.replaceChild(textNode, span);
            }
        }
    });

    // Sau khi sửa xong
    currentErrors = [];
    updateStatusBar(0);
    clearAllHighlights();

    // Tự động kiểm tra lại
    setTimeout(() => {
        performGrammarCheck();
    }, 1000);
}

function updateStatusBar(errorCount, source = '') {
    const statusbar = document.querySelector('.tox-statusbar__text-container');
    const rewriteBtn = document.getElementById('btn-rewrite');
    const fixAllBtn = document.getElementById('btn-fix-all'); // Nút Fix All

    let statusHTML = '';

    if (!statusbar) return;

    if (errorCount === -1) {
        // Check
        statusHTML = '<span style="color: #17a2b8; font-weight: 600;">Checking grammar...</span>';
        if (rewriteBtn) rewriteBtn.style.display = 'none';
        if (fixAllBtn) fixAllBtn.style.display = 'none';
    } else if (errorCount === 0) {
        // No errors
        statusHTML = `<span style="color: #28a745; font-weight: 600;">No grammar errors found.</span>`;
        if (source) statusHTML += ` <span style="color: #6c757d; font-size: 11px; margin-left: 10px;">(Checked by ${source})</span>`;

        if (rewriteBtn) {
            rewriteBtn.style.display = 'block';
            rewriteBtn.classList.add('animate__animated', 'animate__pulse');
        }
        if (fixAllBtn) fixAllBtn.style.display = 'none'; // Ẩn nút Fix All
    } else {
        // Found errors
        statusHTML = `<span style="color: #dc3545; font-weight: 700;">Found ${errorCount} errors</span>`;
        if (source) statusHTML += ` <span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px; color: #495057;">🤖 ${source}</span>`;

        if (rewriteBtn) rewriteBtn.style.display = 'none';

        // Hiện FIX ALL
        if (fixAllBtn) {
            fixAllBtn.style.display = 'block';
            fixAllBtn.innerText = `Fix All (${errorCount})`;
        }
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

function showActionButtons(requestId) {
    const box = document.getElementById('export-actions');
    const pdf = document.getElementById('export-pdf');
    const docx = document.getElementById('export-docx');

    if (box && pdf && docx) {
        box.style.display = 'flex';

        pdf.href = `/export/pdf/${requestId}/`;
        docx.href = `/export/docx/${requestId}/`;
    }
}

document.addEventListener('DOMContentLoaded', function () {
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


let currentRewrittenText = "";

// 1. Mở Modal
function openRewriteModal() {
    const text = activeEditor.getContent({format: 'text'}).trim();
    if (!text) {
        alert("Please enter some text first.");
        return;
    }

    document.getElementById('customRewriteModal').style.display = 'flex';
    resetRewriteModal(); // Đưa về màn hình chọn style
}

// 2. Quay lại màn hình chọn style
function resetRewriteModal() {
    document.getElementById('rewrite-step-1').style.display = 'block';
    document.getElementById('rewrite-loading').style.display = 'none';
    document.getElementById('rewrite-step-2').style.display = 'none';
    currentRewrittenText = "";
}

// 3. Người dùng chọn Style -> Gọi API
async function requestRewrite(style) {
    const text = activeEditor.getContent({format: 'text'}).trim();

    // Chuyển giao diện sang loading
    document.getElementById('rewrite-step-1').style.display = 'none';
    document.getElementById('rewrite-loading').style.display = 'block';
    document.getElementById('loading-style-text').innerText = style;

    try {
        const response = await fetch('/api/rewrite/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                text: text,
                style: style
            })
        });

        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // Hiển thị kết quả
        currentRewrittenText = data.rewritten_text;
        document.getElementById('rewrite-result-text').innerText = currentRewrittenText;
        document.getElementById('result-style-name').innerText = style;

        document.getElementById('rewrite-loading').style.display = 'none';
        document.getElementById('rewrite-step-2').style.display = 'block';

    } catch (err) {
        console.error("Rewrite Error:", err);
        alert("Error: " + err.message);
        resetRewriteModal();
    }
}

// 4. Áp dụng kết quả vào Editor
function applyRewriteResult() {
    if (currentRewrittenText) {
        const formattedHTML = currentRewrittenText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `<p>${line}</p>`)
            .join('');
        activeEditor.setContent(formattedHTML);
        closeRewriteModal();

    }
}

// 5. Đóng Modal
function closeRewriteModal() {
    document.getElementById('customRewriteModal').style.display = 'none';
}