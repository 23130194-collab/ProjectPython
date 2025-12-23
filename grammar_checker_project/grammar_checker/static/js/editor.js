let tooltip;
let activeEditor = null;
let typingTimer;
const DONE_TYPING_INTERVAL = 1500;

function getCSRFToken() {
    const tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
    return tokenInput ? tokenInput.value : "";
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("1. JS Loaded - Fixed Highlighting Version");
    createTooltipElement();

    tinymce.init({
        selector: '#editor',
        height: 500,
        menubar: false,
        plugins: 'lists link wordcount fullscreen image table code',
        toolbar: 'undo redo | bold italic underline | bullist numlist | code',
        branding: false,
        content_style: `
            body { font-family: 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.8; }
            .grammar-error { 
                border-bottom: 2px solid #dc3545; 
                background-color: rgba(220, 53, 69, 0.1);
                cursor: pointer;
            }
            .grammar-error:hover {
                background-color: rgba(220, 53, 69, 0.2);
            }
        `,
        setup: function(editor) {
            activeEditor = editor;

            editor.on('keyup', function(e) {
                clearTimeout(typingTimer);
                typingTimer = setTimeout(performGrammarCheck, DONE_TYPING_INTERVAL);
            });

            editor.on('click', function(e) {
                const target = e.target;
                if (target.classList.contains('grammar-error')) {
                    showTooltip(target, e.clientX, e.clientY,
                        target.dataset.original,
                        target.dataset.suggestion,
                        target.dataset.message
                    );
                } else {
                    hideTooltip();
                }
            });

            editor.on('keydown', () => hideTooltip());
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.grammar-tooltip') && !e.target.closest('.tox-tinymce')) {
            hideTooltip();
        }
    });
});

async function performGrammarCheck() {
    if (!activeEditor) return;
    const text = activeEditor.getContent({format: 'text'}).trim();
    if (!text || text.length < 3) return;

    try {
        console.log("Đang check grammar...");
        const response = await fetch('/api/check/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({text: text})
        });

        const data = await response.json();
        if (data.errors) {
            highlightErrors(data.errors);
        }

        //export
        //  HIỆN NÚT EXPORT SAU KHI CHECK
if (data.request_id) {
    const box = document.getElementById('export-actions');
    const pdf = document.getElementById('export-pdf');
    const docx = document.getElementById('export-docx');

    if (box && pdf && docx) {
        box.style.display = 'block';
        pdf.href = `/export/pdf/${data.request_id}/`;
        docx.href = `/export/docx/${data.request_id}/`;
    }
}
////

    } catch (err) {
        console.error("Lỗi API:", err);
    }
}

function highlightErrors(errors) {
    const editor = activeEditor;
    const bookmark = editor.selection.getBookmark(2, true);

    // 1. Xóa highlight cũ (Reset về text thường)
    const body = editor.getBody();
    const spans = body.querySelectorAll('.grammar-error');
    spans.forEach(span => {
        const text = editor.getDoc().createTextNode(span.innerText);
        span.parentNode.replaceChild(text, span);
    });

    // 2. Bôi đỏ lỗi mới
    errors.forEach(err => {
        const originalWord = err.original;
        const suggestion = err.suggestions[0];
        if (originalWord && suggestion) {
            highlightWordInEditor(originalWord, suggestion, err.message);
        }
    });

    editor.selection.moveToBookmark(bookmark);
}

// --- HÀM QUAN TRỌNG ĐÃ ĐƯỢC NÂNG CẤP ---
function highlightWordInEditor(word, suggestion, message) {
    const editorBody = activeEditor.getBody();
    // TreeWalker duyệt qua tất cả các đoạn text trong editor
    const treeWalker = document.createTreeWalker(editorBody, NodeFilter.SHOW_TEXT, null, false);

    let nodeList = [];
    while(treeWalker.nextNode()) nodeList.push(treeWalker.currentNode);

    // Duyệt ngược để tránh lỗi index khi thay đổi DOM
    for (let i = nodeList.length - 1; i >= 0; i--) {
        const node = nodeList[i];
        const text = node.nodeValue;

        // Tìm TẤT CẢ các vị trí của từ trong đoạn text này
        let searchIndex = 0;
        while (true) {
            const index = text.indexOf(word, searchIndex);
            if (index === -1) break; // Hết tìm thấy

            // KIỂM TRA RANH GIỚI TỪ (Word Boundary Check)
            // Đây là bước sửa lỗi "go" trong "good" hay "a" trong "Last"
            if (isWholeWord(text, index, word.length)) {

                // Tách node text ra để chèn thẻ span
                const range = activeEditor.dom.createRng();
                range.setStart(node, index);
                range.setEnd(node, index + word.length);

                const span = activeEditor.dom.create('span', {
                    'class': 'grammar-error',
                    'data-original': word,
                    'data-suggestion': suggestion,
                    'data-message': message
                }, word);

                try {
                    range.surroundContents(span);
                    // Sau khi wrap, node hiện tại bị chia cắt, ta dừng xử lý node này để tránh lỗi
                    break;
                } catch (e) {
                    console.warn(e);
                }
            }

            // Tiếp tục tìm từ vị trí tiếp theo
            searchIndex = index + 1;
        }
    }
}

// Hàm kiểm tra xem vị trí tìm thấy có phải là từ trọn vẹn không
function isWholeWord(fullText, startIndex, length) {
    const endIndex = startIndex + length;

    // Kiểm tra ký tự liền trước
    if (startIndex > 0) {
        const charBefore = fullText[startIndex - 1];
        // Nếu ký tự trước là chữ cái hoặc số -> Không phải từ trọn vẹn (VD: 'o' trong 'good')
        if (/\w/.test(charBefore)) return false;
    }

    // Kiểm tra ký tự liền sau
    if (endIndex < fullText.length) {
        const charAfter = fullText[endIndex];
        // Nếu ký tự sau là chữ cái hoặc số -> Không phải từ trọn vẹn (VD: 'g' trong 'good')
        if (/\w/.test(charAfter)) return false;
    }

    return true;
}

// --- Phần Tooltip giữ nguyên ---
function createTooltipElement() {
    tooltip = document.createElement('div');
    tooltip.className = 'grammar-tooltip';
    tooltip.innerHTML = `
        <div class="error-title">Lỗi ngữ pháp</div>
        <div class="suggestion-btn" id="apply-fix-btn">Sửa</div>
        <button class="dismiss-btn">Bỏ qua</button>
    `;
    document.body.appendChild(tooltip);

    tooltip.querySelector('.dismiss-btn').onclick = hideTooltip;

    tooltip.querySelector('#apply-fix-btn').onclick = function() {
        if (currentErrorSpan) {
            const suggestion = this.innerText;
            // Thay thế thẻ span lỗi bằng text đúng
            const newTextNode = activeEditor.getDoc().createTextNode(suggestion);
            activeEditor.dom.replace(newTextNode, currentErrorSpan);

            // Sau khi sửa, text mới dính vào text cũ, cần "normalize" lại text node (tùy chọn)
            hideTooltip();
        }
    };
}

let currentErrorSpan = null;

function showTooltip(targetSpan, x, y, original, suggestion, message) {
    currentErrorSpan = targetSpan;
    tooltip.querySelector('.error-title').innerText = message || "Gợi ý";
    tooltip.querySelector('#apply-fix-btn').innerText = suggestion;

    const iframeRect = activeEditor.getContainer().querySelector('iframe').getBoundingClientRect();
    const spanRect = targetSpan.getBoundingClientRect();

    const top = iframeRect.top + spanRect.bottom + window.scrollY + 5;
    const left = iframeRect.left + spanRect.left + window.scrollX;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.display = 'block';
}

function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
    currentErrorSpan = null;
}