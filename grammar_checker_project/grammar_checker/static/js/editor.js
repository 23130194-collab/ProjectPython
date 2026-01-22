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
            showActionButtons(data.request_id);
        }

    } catch (err) {
        console.error("API Error:", err);
        updateStatusBar(0);
    }
}
//Bản gốc

// function highlightErrors(errors) {
//     const editor = activeEditor;
//     const bookmark = editor.selection.getBookmark(2, true);
//
//     clearAllHighlights();
//
//     let content = editor.getContent();
//     const plainText = editor.getContent({format: 'text'});
//
//     console.log("=" * 50);
//     console.log("Starting to highlight errors");
//     console.log("Plain text:", plainText);
//     console.log("Total errors:", errors.length);
//
//     errors.forEach((err, index) => {
//         const original = err.original;
//
//         // QUAN TRỌNG: Kiểm tra suggestions có đúng format không
//         let suggestion = '';
//         if (Array.isArray(err.suggestions) && err.suggestions.length > 0) {
//             suggestion = err.suggestions[0];
//         } else if (typeof err.suggestion === 'string') {
//             // Nếu API trả về "suggestion" thay vì "suggestions"
//             suggestion = err.suggestion;
//         }
//
//         console.log(`Error ${index}:`, {
//             original: original,
//             suggestion: suggestion,
//             message: err.message,
//             type: err.type
//         });
//
//         if (!original || !suggestion) {
//             console.warn(`Skipping error ${index}: missing original or suggestion`);
//             return;
//         }
//
//         content = highlightTextInHTML(
//             content,
//             original,
//             suggestion,
//             err.message || 'Grammar error',
//             err.type || 'grammar',
//             index
//         );
//     });
//
//     console.log("Highlighting complete");
//     console.log("=" * 50);
//
//     editor.setContent(content);
//     editor.selection.moveToBookmark(bookmark);
// }

//Bản thử lần 1: fix lỗi suggestion rỗng:

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

        // SỬA LỖI TẠI ĐÂY:
        // Chỉ bỏ qua nếu KHÔNG CÓ original.
        // Suggestion được phép rỗng (trường hợp xóa từ).
        if (!original) {
            console.warn(`Skipping error ${index}: missing original`);
            return;
        }

        console.log(`🔍 Đang thử highlight lỗi: "${original}" -> "${suggestion}"`);
        content = highlightTextInHTML(content, original, suggestion, err.message, err.type, index);
    });

    editor.setContent(content);
    editor.selection.moveToBookmark(bookmark);
}

//Bản gốc trên github

// function highlightTextInHTML(htmlContent, textToHighlight, suggestion, message, errorType, errorIndex) {
//     // 1. Escape các ký tự đặc biệt trong từ khóa tìm kiếm
//     const escapedText = textToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//
//     // 2. Tạo Pattern tìm kiếm (cho phép tìm xuyên qua thẻ in đậm/nghiêng)
//     const wordSeparator = '(?:\\s+|&nbsp;|<[^>]+>)+';
//     const searchPattern = escapedText.split(/\s+/).join(wordSeparator);
//
//     // 3. REGEX AN TOÀN:
//     // Nhóm 1 (<[^>]+>): Bắt các thẻ HTML (để bỏ qua chúng)
//     // Nhóm 2 (${searchPattern}): Bắt nội dung text thực sự cần highlight
//     const regex = new RegExp(`(<[^>]+>)|(${searchPattern})`, 'gi');
//
//     // 4. Thực hiện thay thế có chọn lọc
//     return htmlContent.replace(regex, function(match, tagMatch, textMatch) {
//         // ƯU TIÊN TUYỆT ĐỐI: Nếu là thẻ HTML (ví dụ: <div>, <strong>, title="...") -> Giữ nguyên
//         if (tagMatch) {
//             return tagMatch;
//         }
//
//         // Chỉ khi là text thực sự mới bọc thẻ lỗi
//         if (textMatch) {
//             return `<span class="grammar-error"
//                 data-original="${escapeHtml(textToHighlight)}"
//                 data-suggestion="${escapeHtml(suggestion)}"
//                 data-message="${escapeHtml(message)}"
//                 data-error-type="${errorType}"
//                 data-error-index="${errorIndex}"
//                 title="${escapeHtml(message)}">${match}</span>`;
//         }
//
//         return match;
//     });
// }

//Bản thử lần 1: thử fix lỗi dấu nháy '

function highlightTextInHTML(htmlContent, textToHighlight, suggestion, message, errorType, errorIndex) {
    // 1. Tách từ khóa thành các phần dựa trên khoảng trắng
    // Ví dụ: "didn't listened" -> ["didn't", "listened"]
    const parts = textToHighlight.split(/\s+/);

    const regexParts = parts.map(part => {
        // 2. Escape các ký tự đặc biệt của Regex trong từ (như dấu chấm, dấu hỏi...)
        let esc = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 3. [QUAN TRỌNG] Xử lý TOÀN DIỆN các loại dấu nháy:
        // Tìm BẤT KỲ loại dấu nháy nào trong từ khóa (thẳng ' hoặc cong ’)
        // Thay thế bằng nhóm Regex chấp nhận TẤT CẢ các biến thể có thể xuất hiện trong HTML:
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
    // Nhóm 1: Thẻ HTML (để bỏ qua)
    // Nhóm 2: Từ khóa cần tìm
    const regex = new RegExp(`(<[^>]+>)|(${searchPattern})`, 'gi');

    return htmlContent.replace(regex, function(match, tagMatch, textMatch) {
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

//
// function applyFix() {
//     console.log("Applying fix");
//
//     if (!currentErrorSpan || !activeEditor) {
//         console.log("No error span selected");
//         return;
//     }
//
//     const suggestion = currentErrorSpan.dataset.suggestion;
//     const errorIndex = parseInt(currentErrorSpan.dataset.errorIndex);
//
//     console.log("Replacing with:", suggestion);
//
//     // --- BẮT ĐẦU PHẦN SỬA ĐỔI (Sử dụng DOM Replace thay vì Selection) ---
//
//     // Sử dụng UndoManager để đảm bảo người dùng có thể Ctrl+Z lại được
//     activeEditor.undoManager.transact(function() {
//         // Tạo một node văn bản mới từ gợi ý (suggestion)
//         // createFragment giúp xử lý an toàn nếu suggestion có chứa ký tự đặc biệt
//         const newContent = activeEditor.dom.createFragment(suggestion);
//
//         // Lệnh này sẽ tìm thẻ currentErrorSpan trong editor
//         // và thay thế HOÀN TOÀN nó bằng nội dung mới
//         activeEditor.dom.replace(newContent, currentErrorSpan);
//     });
//
//     // --- KẾT THÚC PHẦN SỬA ĐỔI ---
//
//     // Cập nhật lại trạng thái mảng lỗi
// //     if (!isNaN(errorIndex) && currentErrors[errorIndex]) {
// //         currentErrors[errorIndex] = null;
// //         const remainingErrors = currentErrors.filter(e => e !== null).length;
// //         updateStatusBar(remainingErrors);
// //     }
// //
// //     hideTooltip();
// //     console.log("Fix applied via DOM Replace");
// //
// //     // Xử lý highlight lại các lỗi còn lại
// //     const activeErrors = currentErrors.filter(e => e !== null);
// //
// //     if (activeErrors.length > 0) {
// //         clearAllHighlights();
// //         highlightErrors(activeErrors);
// //         currentErrors = activeErrors;
// //     } else {
// //         console.log("All errors fixed!");
// //         clearAllHighlights();
// //         currentErrors = [];
// //         updateStatusBar(0);
// //     }
// // }
//
//     // Cập nhật lại trạng thái mảng lỗi
//     if (!isNaN(errorIndex) && currentErrors[errorIndex]) {
//         currentErrors[errorIndex] = null;
//         // Đếm số lỗi còn lại chưa sửa
//         const remainingErrors = currentErrors.filter(e => e !== null).length;
//         updateStatusBar(remainingErrors);
//     }
//
//     hideTooltip();
//     console.log("Fix applied via DOM Replace");
//
//     // LOGIC MỚI: Tự động kiểm tra lại khi hết lỗi
//     const activeErrors = currentErrors.filter(e => e !== null);
//
//     if (activeErrors.length > 0) {
//         // Nếu vẫn còn lỗi -> Chỉ cập nhật highlight cho các lỗi còn lại
//         clearAllHighlights();
//         highlightErrors(activeErrors);
//         // Lưu ý: currentErrors cần được cập nhật để loại bỏ các null nếu muốn gọn
//     } else {
//         // NẾU ĐÃ SỬA HẾT LỖI -> GỌI API KIỂM TRA LẠI TỪ ĐẦU
//         console.log("All errors fixed! Re-checking for safety...");
//         clearAllHighlights();
//         updateStatusBar(-1); // Hiện trạng thái đang check...
//
//         // Thêm độ trễ nhỏ để trải nghiệm mượt hơn
//         setTimeout(() => {
//             performGrammarCheck();
//         }, 500);
//     }
// }

function applyFix() {
    console.log("Applying fix...");

    if (!currentErrorSpan || !activeEditor) {
        console.warn("No error span selected");
        return;
    }

    const suggestion = currentErrorSpan.dataset.suggestion;
    const errorIndex = parseInt(currentErrorSpan.dataset.errorIndex);
    const action = tooltip.querySelector('#apply-fix-btn').dataset.action;

    // --- BẮT ĐẦU SỬA (Sử dụng Selection API để thay thế sạch sẽ) ---
    activeEditor.undoManager.transact(function() {
        // 1. Chọn toàn bộ thẻ span bị lỗi (bôi đen nó)
        activeEditor.selection.select(currentErrorSpan);

        // 2. Ghi đè nội dung vào vùng chọn
        // Việc này sẽ tự động xóa thẻ span cũ và chèn text mới vào
        if (action === "remove" || !suggestion) {
            activeEditor.selection.setContent(""); // Xóa
        } else {
            // Chèn text thuần túy (để tránh lỗi format HTML)
            activeEditor.selection.setContent(activeEditor.dom.encode(suggestion));
        }
    });
    // --- KẾT THÚC SỬA ---

    // Xử lý logic mảng lỗi
    if (!isNaN(errorIndex) && currentErrors[errorIndex]) {
        currentErrors[errorIndex] = null; // Đánh dấu đã sửa
    }

    hideTooltip();

    // Đếm số lỗi còn lại
    const activeErrors = currentErrors.filter(e => e !== null);
    const remainingCount = activeErrors.length;

    console.log(`Fix applied. Remaining errors: ${remainingCount}`);
    updateStatusBar(remainingCount);

    // LOGIC TỰ ĐỘNG KIỂM TRA LẠI
    if (remainingCount === 0) {
        console.log("All errors fixed! Triggering re-check...");
        // Xóa sạch các highlight (nếu còn sót) để giao diện sạch sẽ
        clearAllHighlights();
        updateStatusBar(-1); // Hiện trạng thái đang check...

        // Đợi 1 chút cho DOM ổn định rồi gọi API
        setTimeout(() => {
            performGrammarCheck();
        }, 800);
    } else {
        // LƯU Ý QUAN TRỌNG:
        // Nếu vẫn còn lỗi, TA KHÔNG NÊN gọi highlightErrors(activeErrors) lại ngay lập tức.
        // Vì văn bản đã thay đổi độ dài, vị trí (index) của các lỗi còn lại trong mảng cũ có thể bị lệch.
        // Tốt nhất là giữ nguyên các highlight cũ, chỉ xóa cái vừa sửa (đã được làm bởi bước select & setContent ở trên).
    }
}

//Bản gốc chưa thực hiện phần rewrite

// function updateStatusBar(errorCount) {
//     const statusbar = document.querySelector('.tox-statusbar__text-container');
//     if (!statusbar) return;
//
//     let statusHTML = '';
//
//     if (errorCount === -1) {
//         statusHTML = '<span style="color: #17a2b8; font-weight: 600;">Checking grammar...</span>';
//     } else if (errorCount === 0) {
//         statusHTML = '<span style="color: #28a745; font-weight: 600;">No grammar errors found</span>';
//     } else {
//         statusHTML = `<span style="color: #dc3545; font-weight: 700;">${errorCount} error${errorCount > 1 ? 's' : ''} found</span>`;
//     }
//
//     const existingStatus = statusbar.querySelector('.grammar-status');
//     if (existingStatus) {
//         existingStatus.innerHTML = statusHTML;
//     } else {
//         const statusElement = document.createElement('div');
//         statusElement.className = 'grammar-status';
//         statusElement.innerHTML = statusHTML;
//         statusElement.style.marginRight = '15px';
//         statusbar.insertBefore(statusElement, statusbar.firstChild);
//     }
// }

function updateStatusBar(errorCount, source = '') {
    const statusbar = document.querySelector('.tox-statusbar__text-container');
    // Lấy nút Rewrite từ HTML
    const rewriteBtn = document.getElementById('btn-rewrite');

    let statusHTML = '';

    // Kiểm tra thanh statusbar của TinyMCE có tồn tại không
    if (!statusbar) return;

    if (errorCount === -1) {
        // Trạng thái đang chạy -> Ẩn nút Rewrite
        statusHTML = '<span style="color: #17a2b8; font-weight: 600;">Checking grammar...</span>';
        if (rewriteBtn) rewriteBtn.style.display = 'none';
    }
    else if (errorCount === 0) {
        // Hết lỗi -> Hiện thông báo xanh VÀ Hiện nút Rewrite
        statusHTML = `<span style="color: #28a745; font-weight: 600;">No grammar errors found.</span>`;
        if (source) statusHTML += ` <span style="color: #6c757d; font-size: 11px; margin-left: 10px;">(Checked by ${source})</span>`;

        // [QUAN TRỌNG] Bật nút Rewrite lên
        if (rewriteBtn) {
            rewriteBtn.style.display = 'block'; // Hoặc 'inline-block'
            // Thêm hiệu ứng rung nhẹ nếu muốn gây chú ý
            rewriteBtn.classList.add('animate__animated', 'animate__pulse');
        }
    }
    else {
        // Có lỗi -> Hiện số lỗi đỏ VÀ Ẩn nút Rewrite
        statusHTML = `<span style="color: #dc3545; font-weight: 700;">Found ${errorCount} errors</span>`;
        if (source) statusHTML += ` <span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px; color: #495057;">🤖 ${source}</span>`;

        // [QUAN TRỌNG] Ẩn nút đi để user tập trung sửa lỗi
        if (rewriteBtn) rewriteBtn.style.display = 'none';
    }

    // Cập nhật nội dung chữ vào thanh statusbar
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
    // const actionBox = document.getElementById('action-buttons'); // ID mới
    // const pdfBtn = document.getElementById('export-pdf');
    // const docxBtn = document.getElementById('export-docx');
    //
    // if (actionBox) {
    //     actionBox.style.display = 'flex'; // Hiển thị khu vực nút
    //
    //     // Cập nhật link download
    //     if (requestId) {
    //         pdfBtn.href = `/export/pdf/${requestId}/`;
    //         docxBtn.href = `/export/docx/${requestId}/`;
    //     }
    // }
    const box = document.getElementById('export-actions');
    const pdf = document.getElementById('export-pdf');
    const docx = document.getElementById('export-docx');

    if (box && pdf && docx) {
        // Đổi từ 'block' sang 'flex' để các nút nằm ngang đẹp mắt
        box.style.display = 'flex';

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


let currentRewrittenText = "";

// 1. Mở Modal (Reset về bước 1)
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
                style: style // Gửi style lên server
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
        activeEditor.setContent(currentRewrittenText);
        closeRewriteModal();

        // Re-check lại sau khi sửa (để đảm bảo không còn lỗi mới)
        setTimeout(() => {
            performGrammarCheck();
        }, 500);
    }
}

// 5. Đóng Modal
function closeRewriteModal() {
    document.getElementById('customRewriteModal').style.display = 'none';
}