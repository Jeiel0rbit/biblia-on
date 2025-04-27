document.addEventListener('DOMContentLoaded', () => {
    const bibleContent = document.getElementById('bibleContent');
    const chapterTitle = document.getElementById('chapterTitle');
    const prevChapterBtn = document.getElementById('prevChapterBtn');
    const nextChapterBtn = document.getElementById('nextChapterBtn');
    const initializationMessage = document.getElementById('initializationMessage');
    const initProgressBar = document.getElementById('initProgressBar');
    const selectBookBtn = document.getElementById('selectBookBtn');
    const selectChapterBtn = document.getElementById('selectChapterBtn');
    const optionsMenuBtn = document.getElementById('optionsMenuBtn');

    const bookSelectModalEl = document.getElementById('bookSelectModal');
    const bookSelectModal = new bootstrap.Modal(bookSelectModalEl);
    const modalBookList = document.getElementById('modalBookList');
    const bookSearchInput = document.getElementById('bookSearchInput');

    const chapterSelectModalEl = document.getElementById('chapterSelectModal');
    const chapterSelectModal = new bootstrap.Modal(chapterSelectModalEl);
    const chapterGrid = document.getElementById('chapterGrid');
    const chapterModalBookName = document.getElementById('chapterModalBookName');

    const decreaseFontBtn = document.getElementById('decreaseFontBtn');
    const increaseFontBtn = document.getElementById('increaseFontBtn');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const copiedToastEl = document.getElementById('copiedToast');
    const copiedToast = copiedToastEl ? new bootstrap.Toast(copiedToastEl, { delay: 2000 }) : null;

    let currentBookId = null;
    let currentBookName = '';
    let currentChapter = null;
    let currentBookChapterCount = 0;
    let booksData = [];
    let db = null;
    let currentFontSizeStep = 0;
    const FONT_STEPS = [-2, -1, 0, 1, 2, 3, 4];
    const FONT_SIZES = ['0.85rem', '0.95rem', '1.05rem', '1.15rem', '1.25rem', '1.4rem', '1.6rem'];
    const FONT_SIZES_MOBILE = ['0.8rem', '0.9rem', '1rem', '1.1rem', '1.2rem', '1.3rem', '1.4rem'];
    const FONT_SIZE_LABELS = ['Muito Pequena', 'Pequena', 'Normal', 'Média', 'Grande', 'Muito Grande', 'Enorme'];
    const DEFAULT_FONT_STEP_INDEX = FONT_STEPS.indexOf(0);

    const DB_NAME = 'BiblePWA_DB';
    const DB_VERSION = 1;
    const STORE_BOOKS = 'books';
    const STORE_CHAPTERS = 'chapters';
    const XML_FILE_PATH = 'por-almeida.usfx.xml';
    const NEW_TESTAMENT_START_ID = "MAT";
    const LAST_READ_KEY = 'biblePWA_lastRead';
    const FONT_SIZE_KEY = 'biblePWA_fontSizeStep';

    const CANONICAL_BOOK_ORDER = [
        'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
        '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
        'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
        'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
        'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
        'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
        '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
    ];

    function openDB() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                return reject(new Error("Seu navegador não suporta armazenamento offline (IndexedDB)."));
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject(new Error(`Erro ao abrir DB: ${event.target.error}`));
            request.onsuccess = (event) => { db = event.target.result; resolve(db); };
            request.onupgradeneeded = (event) => {
                db = event.target.result;
                const transaction = event.target.transaction;
                 if (!db.objectStoreNames.contains(STORE_BOOKS)) {
                      db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
                 }
                 if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
                      db.createObjectStore(STORE_CHAPTERS, { keyPath: 'id' });
                 }
                 transaction.onerror = (e) => reject(new Error(`Erro durante onupgradeneeded: ${e.target.error}`));
            };
        });
    }

    function checkDBInitialized() {
        return new Promise((resolve, reject) => {
            if (!db) return reject(new Error("DB não está aberto para verificação."));
            try {
                if (!db.objectStoreNames.contains(STORE_BOOKS) || !db.objectStoreNames.contains(STORE_CHAPTERS)) {
                    return resolve(false);
                }
                const transaction = db.transaction(STORE_BOOKS, 'readonly');
                const store = transaction.objectStore(STORE_BOOKS);
                const countRequest = store.count();
                countRequest.onsuccess = () => resolve(countRequest.result > 0);
                countRequest.onerror = (event) => reject(new Error(`Erro ao contar registros no DB: ${event.target.error}`));
                transaction.onerror = (event) => reject(new Error(`Erro na transação de contagem: ${event.target.error}`));
            } catch (error) {
                reject(new Error(`Erro ao iniciar transação de verificação: ${error.message}`));
            }
        });
    }

    async function parseAndStoreXML() {
        if (initializationMessage) initializationMessage.classList.remove('hidden');
        updateInitProgress(0, true);

        try {
            updateInitProgress(1, true);
            const response = await fetch(XML_FILE_PATH);
            if (!response.ok) throw new Error(`Falha ao buscar ${XML_FILE_PATH}: ${response.statusText} (${response.status})`);
            const xmlText = await response.text();
            updateInitProgress(5, true);

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            updateInitProgress(10, true);

            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error("Erro de Parse XML:", parseError);
                throw new Error(`Erro ao analisar o XML. Verifique o console.`);
            }

            const books = xmlDoc.getElementsByTagName('book');
            const totalBooks = books.length;
            if (totalBooks === 0) throw new Error("Nenhum livro encontrado no arquivo XML.");

            const bookTx = db.transaction(STORE_BOOKS, 'readwrite');
            const chapterTx = db.transaction(STORE_CHAPTERS, 'readwrite');
            const bookStore = bookTx.objectStore(STORE_BOOKS);
            const chapterStore = chapterTx.objectStore(STORE_CHAPTERS);
            let booksProcessed = 0;
            const bookPromises = [];
            const chapterPromises = [];

            for (const bookNode of books) {
                const bookId = bookNode.getAttribute('id');
                const bookNameNode = bookNode.querySelector('h');
                const bookName = bookNameNode ? bookNameNode.textContent.trim() : `Livro ${bookId}`;

                if (!bookId) {
                    console.warn("Livro encontrado sem ID no XML, pulando.");
                    continue;
                }

                const chapters = {};
                let currentChapterNum = 0;
                let versesInCurrentChapter = [];

                for (const node of bookNode.childNodes) {
                    if (node.nodeName === 'c') {
                        if (currentChapterNum > 0 && versesInCurrentChapter.length > 0) {
                            chapters[currentChapterNum] = versesInCurrentChapter;
                        }
                        currentChapterNum = parseInt(node.getAttribute('id'), 10);
                        versesInCurrentChapter = [];
                        if (isNaN(currentChapterNum) || currentChapterNum <= 0) {
                            console.warn(`Número de capítulo inválido no livro ${bookId}: ${node.getAttribute('id')}. Pulando.`);
                            currentChapterNum = 0; // Reset to avoid adding verses to a bad chapter
                        }
                    } else if (node.nodeName === 'v' && currentChapterNum > 0) {
                        const verseNum = parseInt(node.getAttribute('id'), 10);
                        if (!isNaN(verseNum) && verseNum > 0) {
                            // --- CORRECTION START ---
                            // More robust text extraction: collect text content from all subsequent
                            // siblings until the next verse, chapter, or verse end marker.
                            let verseText = "";
                            let currentNode = node.nextSibling; // Start checking nodes *after* the <v> tag

                            while (currentNode) {
                                // Stop if we hit the start of the next structure
                                if (['v', 'c', 've'].includes(currentNode.nodeName)) {
                                    break;
                                }
                                // Append text content from any node (text or element)
                                // This handles text within nested tags like <wj>...</wj>
                                if (currentNode.textContent) {
                                    verseText += currentNode.textContent;
                                }
                                currentNode = currentNode.nextSibling;
                            }
                            // --- CORRECTION END ---

                            verseText = verseText.trim().replace(/\s+/g, ' '); // Clean up collected text

                            if (verseText) {
                                versesInCurrentChapter.push({ v: verseNum, text: verseText });
                            } else {
                                // Keep warning: Indicates verse might be genuinely empty or uses unusual structure
                                console.warn(`Versículo ${verseNum} no cap ${currentChapterNum} do livro ${bookId} parece vazio ou não contém texto extraível.`);
                                // Optional: Decide if you want to store empty verses
                                // versesInCurrentChapter.push({ v: verseNum, text: "" });
                            }
                        } else {
                             console.warn(`Número de versículo inválido no livro ${bookId}, cap ${currentChapterNum}: ${node.getAttribute('id')}. Pulando.`);
                        }
                    }
                    // Note: Other node types like 'p', 's', 'q', 'wj' etc. within a verse are handled
                    // by the corrected text extraction logic above, which uses node.textContent.
                }

                // Store the last chapter's verses if any
                if (currentChapterNum > 0 && versesInCurrentChapter.length > 0) {
                    chapters[currentChapterNum] = versesInCurrentChapter;
                }

                const chapterCount = Object.keys(chapters).length;
                if (chapterCount > 0) {
                    const bookRecord = { id: bookId, name: bookName, chapterCount: chapterCount };
                    bookPromises.push(new Promise((res, rej) => {
                        const req = bookStore.put(bookRecord);
                        req.onsuccess = res;
                        req.onerror = e => rej(new Error(`Falha ao salvar livro ${bookId}: ${e.target.error}`));
                    }));

                    for (const chapNum in chapters) {
                        const chapterRecord = {
                            id: `${bookId}_${chapNum}`,
                            bookId: bookId,
                            chapter: parseInt(chapNum, 10),
                            verses: chapters[chapNum]
                        };
                        chapterPromises.push(new Promise((res, rej) => {
                            const req = chapterStore.put(chapterRecord);
                            req.onsuccess = res;
                            req.onerror = e => rej(new Error(`Falha ao salvar cap ${bookId}_${chapNum}: ${e.target.error}`));
                        }));
                    }
                } else {
                     console.warn(`Livro ${bookId} (${bookName}) sem capítulos/versículos válidos processados.`);
                }

                booksProcessed++;
                updateInitProgress(10 + (booksProcessed / totalBooks) * 85);
            }

            // Wait for all DB operations to complete
            await Promise.all([...bookPromises, ...chapterPromises]);

            // Wait for transactions to complete fully
            const bookTxPromise = new Promise((res, rej) => { bookTx.oncomplete = res; bookTx.onerror = e => rej(new Error(`Erro na transação de livros: ${e.target.error}`)); });
            const chapterTxPromise = new Promise((res, rej) => { chapterTx.oncomplete = res; chapterTx.onerror = e => rej(new Error(`Erro na transação de capítulos: ${e.target.error}`)); });

            await Promise.all([bookTxPromise, chapterTxPromise]);

            updateInitProgress(100);
            await new Promise(resolve => setTimeout(resolve, 300)); // Short delay for UI feedback

        } catch (error) {
            console.error("Erro durante parseAndStoreXML:", error);
            if (initializationMessage) {
                 initializationMessage.innerHTML = `<div class="alert alert-danger p-2 small">Erro ao inicializar banco de dados: ${error.message}. Verifique console e recarregue.</div>`;
                 initializationMessage.classList.remove('hidden');
            }
            updateInitProgress(0); // Reset progress on error
            throw error; // Rethrow to be caught by initializeApp
        } finally {
            // Hide initialization message only if no error was displayed
            if (initializationMessage && !initializationMessage.querySelector('.alert-danger')) {
                initializationMessage.classList.add('hidden');
            }
        }
    }

    function updateInitProgress(percentage, indeterminate = false) {
        const percent = Math.max(0, Math.min(100, Math.round(percentage)));
        if (initProgressBar) {
            const progressBar = initProgressBar.querySelector('.progress-bar') || initProgressBar;
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
            progressBar.classList.toggle('progress-bar-striped', indeterminate || (percent > 0 && percent < 100));
            progressBar.classList.toggle('progress-bar-animated', indeterminate || (percent > 0 && percent < 100));
            progressBar.textContent = indeterminate ? '' : `${percent}%`;
        }
         if (initializationMessage && !initializationMessage.querySelector('.alert-danger')) {
             if (percent === 0 && indeterminate) initializationMessage.textContent = "Preparando...";
             else if (percent < 10) initializationMessage.textContent = "Baixando dados...";
             else if (percent < 95) initializationMessage.textContent = `Processando livros (${percent}%)...`;
             else if (percent < 100) initializationMessage.textContent = "Finalizando...";
             else initializationMessage.textContent = "Pronto!";
         }
    }

    function getBookListFromDB() {
        return new Promise((resolve, reject) => {
            if (!db) return reject(new Error("DB não está aberto para buscar livros."));
            try {
                const transaction = db.transaction(STORE_BOOKS, 'readonly');
                const store = transaction.objectStore(STORE_BOOKS);
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = (event) => resolve(event.target.result || []);
                getAllRequest.onerror = (event) => reject(new Error(`Erro ao buscar lista de livros: ${event.target.error}`));
                transaction.onerror = (event) => reject(new Error(`Erro na transação de busca de livros: ${event.target.error}`));
            } catch(error) {
                 reject(new Error(`Erro ao iniciar transação de busca de livros: ${error.message}`));
            }
        });
    }

    function getChapterDataFromDB(bookId, chapterNum) {
        return new Promise((resolve, reject) => {
            if (!db) return reject(new Error("DB não está aberto para buscar capítulo."));
            try {
                const chapterKey = `${bookId}_${chapterNum}`;
                const transaction = db.transaction(STORE_CHAPTERS, 'readonly');
                const store = transaction.objectStore(STORE_CHAPTERS);
                const getRequest = store.get(chapterKey);
                getRequest.onsuccess = (event) => { resolve(event.target.result || null); };
                getRequest.onerror = (event) => reject(new Error(`Erro ao buscar dados do capítulo ${bookId} ${chapterNum}: ${event.target.error}`));
                transaction.onerror = (event) => reject(new Error(`Erro na transação de busca de capítulo: ${event.target.error}`));
            } catch(error) {
                reject(new Error(`Erro ao iniciar transação de busca de capítulo: ${error.message}`));
            }
        });
    }

    function normalizeText(text = '') {
        if (typeof text !== 'string') return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function populateBookListUI(books) {
        if (!modalBookList) return;

        // Sort books according to canonical order before storing globally
        books.sort((a, b) => {
            const indexA = CANONICAL_BOOK_ORDER.indexOf(a.id);
            const indexB = CANONICAL_BOOK_ORDER.indexOf(b.id);
            // Handle books not found in canonical order (put them at the end)
            if (indexA === -1 && indexB === -1) return a.id.localeCompare(b.id); // Fallback sort
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        booksData = books; // Store the sorted list
        modalBookList.innerHTML = ''; // Clear previous list

        let isNewTestament = false;
        const newTestamentStartIndex = CANONICAL_BOOK_ORDER.indexOf(NEW_TESTAMENT_START_ID);
        const fragment = document.createDocumentFragment();

        // Add Old Testament header if needed (can be styled later)
        const oldTestamentDivider = document.createElement('div');
        oldTestamentDivider.classList.add('list-group-item', 'disabled', 'bg-light');
        oldTestamentDivider.innerHTML = `<strong>Antigo Testamento</strong>`;
        fragment.appendChild(oldTestamentDivider);

        books.forEach(book => {
            const bookIndex = CANONICAL_BOOK_ORDER.indexOf(book.id);

            // Add New Testament divider when appropriate
            if (!isNewTestament && bookIndex !== -1 && bookIndex >= newTestamentStartIndex) {
                const divider = document.createElement('div');
                divider.classList.add('list-group-item', 'disabled', 'bg-light', 'mt-2'); // Add margin top
                divider.innerHTML = `<strong>Novo Testamento</strong>`;
                fragment.appendChild(divider);
                isNewTestament = true;
            }

            const a = document.createElement('a');
            a.classList.add('list-group-item', 'list-group-item-action');
            a.href = '#';
            a.textContent = book.name;
            a.dataset.bookId = book.id;
            a.dataset.bookName = book.name;
            a.dataset.chapters = book.chapterCount;
            fragment.appendChild(a);
        });

        modalBookList.appendChild(fragment);
        if (selectBookBtn) selectBookBtn.disabled = books.length === 0;
    }

    function filterBooks() {
        if (!bookSearchInput || !modalBookList) return;
        const filter = normalizeText(bookSearchInput.value);
        const items = modalBookList.querySelectorAll('a.list-group-item-action');
        items.forEach(item => {
            const bookName = item.textContent;
            const normalizedBookName = normalizeText(bookName);
            // Show if filter is empty OR book name (normalized or original) contains filter
            const isHidden = filter &&
                             normalizedBookName.indexOf(filter) === -1 &&
                             bookName.toLowerCase().indexOf(filter) === -1;
            item.classList.toggle('hidden', isHidden);
        });
    }

    function selectBook(bookId, bookName, chapterCount) {
        if (!bookId || !bookName || chapterCount === undefined || isNaN(parseInt(chapterCount, 10))) {
            console.error("Tentativa de selecionar livro inválido:", bookId, bookName, chapterCount);
            return;
        }

        currentBookId = bookId;
        currentBookName = bookName;
        currentBookChapterCount = parseInt(chapterCount, 10);

        if (selectBookBtn) {
             selectBookBtn.innerHTML = `<i class="bi bi-book-fill me-1"></i><span class="d-none d-sm-inline">${bookName}</span>`;
             selectBookBtn.title = bookName;
        }
        if (selectChapterBtn) selectChapterBtn.disabled = false;

        selectChapter(1); // Default to chapter 1 when selecting a new book
        bookSelectModal.hide();
        saveLastReadPosition();
    }

    function populateChapterGridUI(bookName, chapterCount, activeChapter) {
        if (!chapterModalBookName || !chapterGrid) return;

        chapterModalBookName.textContent = bookName;
        chapterGrid.innerHTML = '';

        if (chapterCount > 0) {
            const fragment = document.createDocumentFragment();
            for (let i = 1; i <= chapterCount; i++) {
                const button = document.createElement('button');
                button.type = 'button';
                button.classList.add('btn', 'btn-outline-primary', 'm-1', 'chapter-grid-btn');
                if (i === activeChapter) {
                    button.classList.add('active', 'btn-primary');
                    button.classList.remove('btn-outline-primary');
                }
                button.dataset.chapter = i;
                button.textContent = i;
                button.setAttribute('aria-label', `Selecionar capítulo ${i}`);
                fragment.appendChild(button);
            }
            chapterGrid.appendChild(fragment);
        } else {
            chapterGrid.innerHTML = '<span class="text-muted small">Sem capítulos disponíveis.</span>';
        }
    }

    function selectChapter(chapterNum) {
        const chap = parseInt(chapterNum, 10);

        // Validate selection
        if (!currentBookId || isNaN(chap) || chap < 1 || chap > currentBookChapterCount) {
            console.warn(`Seleção de capítulo inválida: ${chapterNum} para ${currentBookId} (Total: ${currentBookChapterCount})`);
            chapterSelectModal.hide(); // Close modal even on invalid selection from grid
            // Optionally, load a default or show an error instead of just returning
            // loadBibleContent(currentBookId, 1); // Example: load first chapter?
            return;
        }

        currentChapter = chap;
        loadBibleContent(currentBookId, currentChapter);

        // Update chapter grid UI if it's open/relevant
        const activeChapterBtn = chapterGrid?.querySelector('.chapter-grid-btn.active');
        if (activeChapterBtn) {
            activeChapterBtn.classList.remove('active', 'btn-primary');
            activeChapterBtn.classList.add('btn-outline-primary');
        }
        const newActiveBtn = chapterGrid?.querySelector(`.chapter-grid-btn[data-chapter="${chap}"]`);
        if (newActiveBtn) {
            newActiveBtn.classList.add('active', 'btn-primary');
            newActiveBtn.classList.remove('btn-outline-primary');
        }

        chapterSelectModal.hide();
        saveLastReadPosition();
    }

    async function loadBibleContent(bookId, chapterNum) {
        if (!bibleContent) return;

        bibleContent.setAttribute('aria-busy', 'true');
        // Clear previous content and show loading indicator
        bibleContent.innerHTML = `
            <div class="d-flex flex-column justify-content-center align-items-center mt-5 py-5 text-center" aria-hidden="true">
                <div class="spinner-border text-primary mb-2" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <span class="text-muted">Carregando ${currentBookName} ${chapterNum}...</span>
            </div>`;
        updateUI(); // Update nav buttons etc. immediately

        try {
            const chapterData = await getChapterDataFromDB(bookId, chapterNum);

            if (chapterData?.verses?.length > 0) {
                // Use DocumentFragment for performance when building large content
                const fragment = document.createDocumentFragment();
                chapterData.verses.forEach(v => {
                     // Ensure verse text exists, provide fallback if needed
                     const verseText = v.text || "[Versículo sem texto]";
                     const p = document.createElement('p');
                     p.innerHTML = `
                         <span class="verse-ref user-select-none me-1" tabindex="0" data-verse="${v.v}" role="button" aria-label="Versículo ${v.v}" title="Copiar ${currentBookName} ${chapterNum}:${v.v}">
                           <strong>${v.v}</strong>
                         </span>
                         <span class="verse-text">${verseText}</span>`;
                     fragment.appendChild(p);
                });
                bibleContent.innerHTML = ''; // Clear loading indicator
                bibleContent.appendChild(fragment);
                // Try setting focus to the container for keyboard navigation start point
                bibleContent.focus({ preventScroll: true });
            } else {
                // Handle case where chapter exists but has no verses, or DB retrieval failed softly
                 bibleContent.innerHTML = `<p class="text-warning fst-italic text-center mt-4">Conteúdo não encontrado para ${currentBookName} ${chapterNum}.</p>`;
                 // Log specific reason if possible
                 const bookInfo = booksData.find(b => b.id === bookId);
                 if (!bookInfo) {
                      console.warn(`Informações do livro ${bookId} não encontradas nos dados carregados.`);
                 } else if (chapterNum > bookInfo.chapterCount) {
                      console.warn(`Capítulo ${chapterNum} solicitado além dos capítulos existentes (${bookInfo.chapterCount}) para ${bookId}`);
                 } else {
                      console.warn(`Dados do capítulo ${bookId} ${chapterNum} vieram vazios ou nulos do DB.`);
                 }
            }
        } catch (error) {
            console.error(`Falha ao carregar capítulo ${bookId} ${chapterNum}:`, error);
            bibleContent.innerHTML = `<p class="text-danger fst-italic text-center mt-4">Falha ao carregar capítulo. Verifique console. Detalhes: ${error.message}</p>`;
        } finally {
            bibleContent.setAttribute('aria-busy', 'false');
            updateUI(); // Ensure UI reflects final state
            // Scroll to top smoothly after content is loaded/updated
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function updateUI() {
        if (chapterTitle) {
            chapterTitle.textContent = (currentBookName && currentChapter)
                ? `${currentBookName} ${currentChapter}`
                : "Selecione Livro e Capítulo";
        }
        // Ensure chapter selection button is enabled only if a book is selected
        if (selectChapterBtn) selectChapterBtn.disabled = !currentBookId;
        // Update font size buttons based on current step
        if (decreaseFontBtn) decreaseFontBtn.disabled = currentFontSizeStep <= 0;
        if (increaseFontBtn) increaseFontBtn.disabled = currentFontSizeStep >= FONT_STEPS.length - 1;

        let prevRefText = '';
        let nextRefText = '';
        let isPrevDisabled = true;
        let isNextDisabled = true;

        if (currentBookId && currentChapter && booksData.length > 0) {
            // Find index based on the *current* booksData array (which is sorted)
            const currentBookIndex = booksData.findIndex(b => b.id === currentBookId);

            if (currentBookIndex !== -1) {
                // Check previous chapter/book
                if (currentChapter > 1) {
                    isPrevDisabled = false;
                    prevRefText = `${currentBookName} ${currentChapter - 1}`;
                } else if (currentBookIndex > 0) { // Is there a previous book?
                    isPrevDisabled = false;
                    const prevBook = booksData[currentBookIndex - 1];
                    prevRefText = `${prevBook.name} ${prevBook.chapterCount}`; // Go to last chapter of prev book
                } else {
                    prevRefText = 'Início'; // Already at the first chapter of the first book
                }

                // Check next chapter/book
                if (currentChapter < currentBookChapterCount) {
                    isNextDisabled = false;
                    nextRefText = `${currentBookName} ${currentChapter + 1}`;
                } else if (currentBookIndex < booksData.length - 1) { // Is there a next book?
                    isNextDisabled = false;
                    const nextBook = booksData[currentBookIndex + 1];
                    nextRefText = `${nextBook.name} 1`; // Go to first chapter of next book
                } else {
                    nextRefText = 'Fim'; // Already at the last chapter of the last book
                }
            } else {
                 console.warn(`Livro atual (${currentBookId}) não encontrado na lista de livros para navegação.`);
            }
        }

        // Update Previous Button State
        if (prevChapterBtn) {
             prevChapterBtn.disabled = isPrevDisabled;
             const prevRefSpan = prevChapterBtn.querySelector('.button-nav-ref');
             if (prevRefSpan) prevRefSpan.textContent = prevRefText;
             prevChapterBtn.title = isPrevDisabled ? '' : `Ir para ${prevRefText}`;
        }
        // Update Next Button State
        if (nextChapterBtn) {
             nextChapterBtn.disabled = isNextDisabled;
             const nextRefSpan = nextChapterBtn.querySelector('.button-nav-ref');
             if (nextRefSpan) nextRefSpan.textContent = nextRefText;
             nextChapterBtn.title = isNextDisabled ? '' : `Ir para ${nextRefText}`;
        }
    }

    function navigatePrev() {
        if (prevChapterBtn?.disabled) return; // Don't navigate if disabled

        if (currentChapter > 1) {
            selectChapter(currentChapter - 1);
        } else {
            // Go to the last chapter of the previous book
            const currentBookIndex = booksData.findIndex(b => b.id === currentBookId);
            if (currentBookIndex > 0) {
                const prevBook = booksData[currentBookIndex - 1];
                // Select the book first (which defaults to chapter 1)
                selectBook(prevBook.id, prevBook.name, prevBook.chapterCount);
                // Then, immediately try to select the *last* chapter of that book.
                // Use setTimeout to allow the initial book selection/load (which goes to chap 1)
                // to potentially finish before overriding with the last chapter. Might need adjustment.
                setTimeout(() => {
                    // Double-check if the book selection was successful before changing chapter
                    if(currentBookId === prevBook.id) {
                         selectChapter(prevBook.chapterCount);
                    } else {
                         console.warn("Navegação anterior: seleção do livro anterior falhou ou foi alterada rapidamente.");
                    }
                }, 50); // Small delay, adjust if needed
            }
        }
    }

    function navigateNext() {
        if (nextChapterBtn?.disabled) return; // Don't navigate if disabled

        if (currentChapter < currentBookChapterCount) {
            selectChapter(currentChapter + 1);
        } else {
            // Go to the first chapter of the next book
            const currentBookIndex = booksData.findIndex(b => b.id === currentBookId);
            if (currentBookIndex < booksData.length - 1) {
                const nextBook = booksData[currentBookIndex + 1];
                // selectBook already defaults to chapter 1
                selectBook(nextBook.id, nextBook.name, nextBook.chapterCount);
            }
        }
    }

    function applyFontSize(stepIndex) {
        if (!bibleContent || !fontSizeValue || stepIndex < 0 || stepIndex >= FONT_STEPS.length) return;

        currentFontSizeStep = stepIndex;
        const isMobile = window.innerWidth < 768; // Example breakpoint, adjust as needed
        const fontSize = isMobile ? FONT_SIZES_MOBILE[currentFontSizeStep] : FONT_SIZES[currentFontSizeStep];
        const fontLabel = FONT_SIZE_LABELS[currentFontSizeStep];

        // Apply font size to the main content area
        document.documentElement.style.setProperty('--bible-font-size', fontSize); // Use CSS variable
        // bibleContent.style.fontSize = fontSize; // Direct style application (alternative)

        fontSizeValue.textContent = fontLabel;

        // Update button states
        if (decreaseFontBtn) decreaseFontBtn.disabled = currentFontSizeStep <= 0;
        if (increaseFontBtn) increaseFontBtn.disabled = currentFontSizeStep >= FONT_STEPS.length - 1;

        // Save preference
        try {
             localStorage.setItem(FONT_SIZE_KEY, currentFontSizeStep.toString());
        } catch (e) {
             console.warn("Não foi possível salvar preferência de tamanho da fonte:", e);
        }
    }

    function increaseFontSize() {
        if (currentFontSizeStep < FONT_STEPS.length - 1) {
            applyFontSize(currentFontSizeStep + 1);
        }
    }

    function decreaseFontSize() {
        if (currentFontSizeStep > 0) {
            applyFontSize(currentFontSizeStep - 1);
        }
    }

    function copyVerseToClipboard(verseElement) {
        if (!verseElement || !navigator.clipboard) {
             console.warn("Clipboard API not available or verse element missing.");
             alert("Não foi possível copiar. Seu navegador pode não suportar esta funcionalidade ou estar em modo inseguro.");
             return;
        }

        const verseNum = verseElement.dataset.verse;
        // Find the sibling span containing the verse text
        const verseTextElement = verseElement.nextElementSibling; //.matches('.verse-text') ? verseElement.nextElementSibling : null;

        // Basic check if the next sibling exists and might contain text
        if (!verseTextElement) {
             console.warn("Não foi possível encontrar o elemento de texto do versículo para:", verseElement);
             return;
        }
        const verseText = verseTextElement.textContent?.trim() ?? ''; // Use optional chaining and nullish coalescing

        if (verseNum && verseText && currentBookName && currentChapter) {
            const textToCopy = `${currentBookName} ${currentChapter}:${verseNum} - ${verseText}`;
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    console.log("Versículo copiado:", textToCopy);
                    if (copiedToast) copiedToast.show(); // Show feedback
                })
                .catch(err => {
                    console.error("Falha ao copiar versículo:", err);
                    // Provide more user-friendly feedback if possible
                    alert(`Erro ao copiar o versículo (${err.name}): ${err.message}. Verifique as permissões do navegador (área de transferência).`);
                });
        } else {
             console.warn("Dados incompletos para copiar versículo:", {verseNum, verseText, currentBookName, currentChapter});
             alert("Não foi possível formatar o texto do versículo para cópia.");
        }
    }

    function saveLastReadPosition() {
        if (currentBookId && currentChapter) {
            try {
                const lastRead = {
                    bookId: currentBookId,
                    chapter: currentChapter,
                    // Store name/count too, helps restore UI faster if book list isn't ready
                    bookName: currentBookName,
                    chapterCount: currentBookChapterCount
                };
                localStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead));
            } catch (e) {
                console.warn("Não foi possível salvar última posição:", e);
            }
        }
    }

    function loadLastReadPosition() {
        try {
            const savedState = localStorage.getItem(LAST_READ_KEY);
            if (savedState) {
                const lastRead = JSON.parse(savedState);
                // Validate the data before using it
                if (lastRead.bookId && lastRead.chapter && typeof lastRead.bookId === 'string' && typeof lastRead.chapter === 'number') {
                    // Check if the saved book ID still exists in our loaded data
                    if (booksData.some(b => b.id === lastRead.bookId)) {
                        // Restore state
                        currentBookId = lastRead.bookId;
                        // Prefer name/count from loaded data if available, fallback to saved
                        const bookData = booksData.find(b => b.id === lastRead.bookId);
                        currentBookName = bookData?.name ?? lastRead.bookName ?? 'Livro Desconhecido';
                        currentBookChapterCount = bookData?.chapterCount ?? lastRead.chapterCount ?? 0;
                        const chapterToLoad = lastRead.chapter;

                        // Validate chapter number against actual count
                        if (chapterToLoad > 0 && chapterToLoad <= currentBookChapterCount) {
                           if (selectBookBtn && currentBookName) {
                                selectBookBtn.innerHTML = `<i class="bi bi-book-fill me-1"></i><span class="d-none d-sm-inline">${currentBookName}</span>`;
                                selectBookBtn.title = currentBookName;
                           }
                           if (selectChapterBtn) selectChapterBtn.disabled = false;

                            // Load the content for the restored position
                            selectChapter(chapterToLoad); // This will handle loading and UI updates
                            console.log(`Posição restaurada: ${currentBookName} ${currentChapter}`);
                            return true; // Indicate success
                        } else {
                             console.warn(`Capítulo salvo (${chapterToLoad}) inválido para ${currentBookName} (Total: ${currentBookChapterCount}). Carregando capítulo 1.`);
                              selectChapter(1); // Fallback to chapter 1
                              return true; // Still counts as restoring the book
                        }
                    } else {
                         console.warn(`Livro salvo (${lastRead.bookId}) não encontrado nos dados atuais. Ignorando última posição.`);
                         localStorage.removeItem(LAST_READ_KEY);
                    }
                } else {
                     console.warn("Dados salvos de última leitura inválidos ou incompletos.");
                     localStorage.removeItem(LAST_READ_KEY);
                }
            }
        } catch (e) {
            console.error("Erro ao carregar última posição:", e);
            // Clear potentially corrupted data
             localStorage.removeItem(LAST_READ_KEY);
        }
        return false; // Indicate failure or no saved state
    }

    function loadFontSizePreference() {
         try {
             const savedStep = localStorage.getItem(FONT_SIZE_KEY);
             if (savedStep !== null) {
                 const stepIndex = parseInt(savedStep, 10);
                 // Validate the saved step index
                 if (!isNaN(stepIndex) && stepIndex >= 0 && stepIndex < FONT_STEPS.length) {
                     applyFontSize(stepIndex);
                     console.log(`Tamanho da fonte restaurado: passo ${stepIndex} (${FONT_SIZE_LABELS[stepIndex]})`);
                     return; // Success
                 } else {
                      console.warn(`Valor salvo de tamanho da fonte (${savedStep}) inválido.`);
                      localStorage.removeItem(FONT_SIZE_KEY); // Remove invalid data
                 }
             }
         } catch (e) {
              console.error("Erro ao carregar pref. de tamanho da fonte:", e);
              localStorage.removeItem(FONT_SIZE_KEY); // Remove potentially corrupted data
         }
         // Apply default if no valid preference was loaded
         console.log("Aplicando tamanho de fonte padrão.");
         applyFontSize(DEFAULT_FONT_STEP_INDEX);
    }

    async function initializeApp() {
        try {
            await openDB();
            console.log("DB aberto.");

            const isInitialized = await checkDBInitialized();
            console.log("DB inicializado?", isInitialized);

            if (!isInitialized) {
                console.log("Inicializando DB do XML...");
                await parseAndStoreXML(); // This now throws on critical parse/store errors
                console.log("Parse e armazenamento concluídos.");
            } else {
                 if (initializationMessage) initializationMessage.classList.add('hidden');
            }

            const books = await getBookListFromDB();
            if (books.length === 0 && !isInitialized) {
                // This case should ideally not happen if parseAndStoreXML worked
                // but didn't throw an error. Indicates a deeper issue.
                throw new Error("Falha crítica: DB vazio após tentativa de inicialização, mas nenhum erro reportado.");
            } else if (books.length === 0 && isInitialized) {
                 console.warn("DB está inicializado, mas a lista de livros está vazia. Pode indicar problema na leitura do DB.");
                 // Potentially try re-initializing or showing error
            }
            console.log(`Carregados ${books.length} livros do DB.`);

            // Populate UI and load preferences
            populateBookListUI(books); // Populates booksData internally after sorting
            loadFontSizePreference();

            // Attempt to restore last read position
            const restoredPosition = loadLastReadPosition();

            // If no position restored AND there are books, load the default (first book, chap 1)
            if (!restoredPosition && booksData.length > 0) {
                console.log("Nenhuma posição salva válida. Carregando padrão (Primeiro livro, Cap 1).");
                const firstBook = booksData[0]; // Assumes booksData is populated and sorted
                if (firstBook) {
                    // selectBook will call selectChapter(1)
                    selectBook(firstBook.id, firstBook.name, firstBook.chapterCount);
                } else {
                     // Should not happen if booksData.length > 0
                     throw new Error("Inconsistência: Há livros, mas não foi possível acessar o primeiro.");
                }
            } else if (booksData.length === 0) {
                 // Handle case where there are truly no books (e.g., XML was empty/invalid, DB read failed)
                 console.error("Nenhum livro disponível para exibição.");
                 if(chapterTitle) chapterTitle.textContent = "Nenhum Livro Carregado";
                 if(bibleContent) bibleContent.innerHTML = '<p class="text-danger text-center mt-4">Não foi possível carregar os livros da Bíblia. Verifique o arquivo de dados ou o armazenamento local.</p>';
                 // Disable UI elements that depend on books
                 if(selectBookBtn) selectBookBtn.disabled = true;
                 if(selectChapterBtn) selectChapterBtn.disabled = true;
                 if(prevChapterBtn) prevChapterBtn.disabled = true;
                 if(nextChapterBtn) nextChapterBtn.disabled = true;
                 if(optionsMenuBtn) optionsMenuBtn.disabled = true;
            }

            // Final UI update after initial load/restore
            updateUI();

        } catch (error) {
            // Catch errors from openDB, checkDB, parseAndStore, getBookList, or initial load logic
            console.error("Erro fatal na inicialização:", error);
            if (chapterTitle) chapterTitle.textContent = "Erro na Inicialização";
            // Display error message prominently
            if (bibleContent) bibleContent.innerHTML = `<div class="alert alert-danger mt-4 mx-auto" style="max-width: 600px;"><strong>Erro Crítico ao Inicializar:</strong><br>${error.message}<br><small>Por favor, recarregue a página. Se o problema persistir, verifique o console para mais detalhes.</small></div>`;
            // Hide initialization progress/message if it was visible
            if (initializationMessage) initializationMessage.classList.add('hidden');
            // Disable controls on fatal error
            if (selectBookBtn) selectBookBtn.disabled = true;
            if (selectChapterBtn) selectChapterBtn.disabled = true;
            if (prevChapterBtn) prevChapterBtn.disabled = true;
            if (nextChapterBtn) nextChapterBtn.disabled = true;
            if (optionsMenuBtn) optionsMenuBtn.disabled = true;
        }
    }

    // --- Event Listeners ---

    if (prevChapterBtn) prevChapterBtn.addEventListener('click', navigatePrev);
    if (nextChapterBtn) nextChapterBtn.addEventListener('click', navigateNext);

    // Book Selection Modal
    if (selectBookBtn) {
        selectBookBtn.addEventListener('click', () => {
             if (bookSearchInput) {
                  bookSearchInput.value = ''; // Clear search on open
                  filterBooks(); // Show all books initially
             }
             // Ensure the list is populated before showing
             if (booksData.length > 0) {
                 populateBookListUI(booksData); // Re-populate in case data changed? Or rely on initial load.
                 bookSelectModal.show();
                 // Set focus to search input after modal is shown
                 bookSelectModalEl?.addEventListener('shown.bs.modal', () => {
                     bookSearchInput?.focus();
                 }, { once: true }); // Remove listener after first execution
             } else {
                 console.warn("Tentativa de abrir seleção de livros sem livros carregados.");
                 // Optionally show a message to the user
             }
        });
    }
    if (bookSearchInput) {
         bookSearchInput.addEventListener('input', filterBooks);
         // Clear search when modal is closed
         bookSelectModalEl?.addEventListener('hidden.bs.modal', () => {
             bookSearchInput.value = '';
             // Optionally reset scroll position of the list
         });
    }
    if (modalBookList) {
         modalBookList.addEventListener('click', (event) => {
             const targetLink = event.target.closest('a.list-group-item-action'); // Handle clicks inside the link too
             if (targetLink && targetLink.dataset.bookId) {
                 event.preventDefault();
                 const { bookId, bookName, chapters } = targetLink.dataset;
                 selectBook(bookId, bookName, parseInt(chapters, 10));
             }
         });
    }

    // Chapter Selection Modal
    if (selectChapterBtn) {
        selectChapterBtn.addEventListener('click', () => {
             if (currentBookId && currentBookChapterCount > 0) {
                 populateChapterGridUI(currentBookName, currentBookChapterCount, currentChapter);
                 chapterSelectModal.show();
                 // Focus the active/first chapter button after modal is shown
                 chapterSelectModalEl?.addEventListener('shown.bs.modal', () => {
                     const activeBtn = chapterGrid?.querySelector('.chapter-grid-btn.active') || chapterGrid?.querySelector('.chapter-grid-btn');
                     activeBtn?.focus();
                 }, { once: true });
             } else {
                  console.warn("Tentativa de abrir seleção de capítulos sem livro selecionado ou sem capítulos.");
             }
        });
    }
    if (chapterGrid) {
         chapterGrid.addEventListener('click', (event) => {
             const targetButton = event.target.closest('.chapter-grid-btn');
             if (targetButton && targetButton.dataset.chapter) {
                 selectChapter(targetButton.dataset.chapter);
             }
         });
         // Allow selecting chapter with Enter key if button has focus
         chapterGrid.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                   const targetButton = event.target.closest('.chapter-grid-btn');
                   if (targetButton && targetButton.dataset.chapter && document.activeElement === targetButton) {
                        event.preventDefault(); // Prevent default button action if any
                        selectChapter(targetButton.dataset.chapter);
                   }
              }
         });
    }

    // Font Size Controls
    if (decreaseFontBtn) decreaseFontBtn.addEventListener('click', decreaseFontSize);
    if (increaseFontBtn) increaseFontBtn.addEventListener('click', increaseFontSize);

    // Verse Copy Functionality (Click and Keyboard)
    if (bibleContent) {
        // Click listener
        bibleContent.addEventListener('click', (event) => {
            const verseRefElement = event.target.closest('.verse-ref');
            if (verseRefElement) {
                copyVerseToClipboard(verseRefElement);
            }
        });
        // Keyboard listener (Enter or Space) for accessibility
        bibleContent.addEventListener('keydown', (event) => {
             // Check if the focused element is a verse reference
             const verseRefElement = document.activeElement?.closest('.verse-ref');
             if (verseRefElement && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault(); // Prevent scrolling on Space or default Enter action
                  copyVerseToClipboard(verseRefElement);
             }
        });
    }

    // Initialize the application
    initializeApp();

});
