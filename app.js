app.js:



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

                            currentChapterNum = 0;

                        }

                    } else if (node.nodeName === 'v' && currentChapterNum > 0) {

                        const verseNum = parseInt(node.getAttribute('id'), 10);

                        if (!isNaN(verseNum) && verseNum > 0) {

                            let verseText = "";

                            let nextNode = node.nextSibling;

                            while (nextNode && !['v', 'c', 've'].includes(nextNode.nodeName)) {

                                if (nextNode.nodeType === Node.TEXT_NODE) {

                                    verseText += nextNode.textContent;

                                }

                                nextNode = nextNode.nextSibling;

                            }

                            verseText = verseText.trim().replace(/\s+/g, ' ');

                            if (verseText) {

                                versesInCurrentChapter.push({ v: verseNum, text: verseText });

                            } else {

                                console.warn(`Versículo ${verseNum} no cap ${currentChapterNum} do livro ${bookId} parece vazio.`);

                            }

                        } else {

                             console.warn(`Número de versículo inválido no livro ${bookId}, cap ${currentChapterNum}: ${node.getAttribute('id')}. Pulando.`);

                        }

                    }

                }



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

                     console.warn(`Livro ${bookId} (${bookName}) sem capítulos/versículos válidos.`);

                }



                booksProcessed++;

                updateInitProgress(10 + (booksProcessed / totalBooks) * 85);

            }



            await Promise.all([...bookPromises, ...chapterPromises]);



            const bookTxPromise = new Promise((res, rej) => { bookTx.oncomplete = res; bookTx.onerror = e => rej(new Error(`Erro na transação de livros: ${e.target.error}`)); });

            const chapterTxPromise = new Promise((res, rej) => { chapterTx.oncomplete = res; chapterTx.onerror = e => rej(new Error(`Erro na transação de capítulos: ${e.target.error}`)); });



            await Promise.all([bookTxPromise, chapterTxPromise]);



            updateInitProgress(100);

            await new Promise(resolve => setTimeout(resolve, 300));



        } catch (error) {

            console.error("Erro durante parseAndStoreXML:", error);

            if (initializationMessage) {

                 initializationMessage.innerHTML = `<div class="alert alert-danger p-2 small">Erro ao inicializar banco de dados: ${error.message}. Verifique console e recarregue.</div>`;

                 initializationMessage.classList.remove('hidden');

            }

            updateInitProgress(0);

            throw error;

        } finally {

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



        books.sort((a, b) => {

            const indexA = CANONICAL_BOOK_ORDER.indexOf(a.id);

            const indexB = CANONICAL_BOOK_ORDER.indexOf(b.id);

            if (indexA === -1) return 1;

            if (indexB === -1) return -1;

            return indexA - indexB;

        });



        booksData = books;

        modalBookList.innerHTML = '';



        let isNewTestament = false;

        const newTestamentStartIndex = CANONICAL_BOOK_ORDER.indexOf(NEW_TESTAMENT_START_ID);

        const fragment = document.createDocumentFragment();



        books.forEach(book => {

            const bookIndex = CANONICAL_BOOK_ORDER.indexOf(book.id);



            if (!isNewTestament && bookIndex !== -1 && bookIndex >= newTestamentStartIndex) {

                const divider = document.createElement('div');

                divider.classList.add('list-group-item', 'disabled', 'bg-light', 'mt-2');

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

            const isHidden = filter && normalizedBookName.indexOf(filter) === -1 && bookName.toLowerCase().indexOf(filter) === -1;

            item.classList.toggle('hidden', isHidden);

        });

    }



    function selectBook(bookId, bookName, chapterCount) {

        if (!bookId || !bookName || chapterCount === undefined) {

            console.error("Tentativa de selecionar livro inválido:", bookId, bookName, chapterCount);

            return;

        }



        currentBookId = bookId;

        currentBookName = bookName;

        currentBookChapterCount = parseInt(chapterCount, 10) || 0;



        if (selectBookBtn) {

             selectBookBtn.innerHTML = `<i class="bi bi-book-fill me-1"></i><span class="d-none d-sm-inline">${bookName}</span>`;

             selectBookBtn.title = bookName;

        }

        if (selectChapterBtn) selectChapterBtn.disabled = false;



        selectChapter(1);

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



        if (!currentBookId || isNaN(chap) || chap < 1 || chap > currentBookChapterCount) {

            console.warn(`Seleção de capítulo inválida: ${chapterNum} para ${currentBookId}`);

            chapterSelectModal.hide();

            return;

        }



        currentChapter = chap;

        loadBibleContent(currentBookId, currentChapter);



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

        bibleContent.innerHTML = `

            <div class="d-flex flex-column justify-content-center align-items-center mt-5 py-5 text-center" aria-hidden="true">

                <div class="spinner-border text-primary mb-2" role="status">

                    <span class="visually-hidden">Carregando...</span>

                </div>

                <span class="text-muted">Carregando ${currentBookName} ${chapterNum}...</span>

            </div>`;

        updateUI();



        try {

            const chapterData = await getChapterDataFromDB(bookId, chapterNum);



            if (chapterData?.verses?.length > 0) {

                const contentHtml = chapterData.verses.map(v =>

                    `<p>

                       <span class="verse-ref user-select-none me-1" tabindex="0" data-verse="${v.v}" role="button" aria-label="Versículo ${v.v}" title="Copiar ${currentBookName} ${chapterNum}:${v.v}">

                         <strong>${v.v}</strong>

                       </span>

                       <span class="verse-text">${v.text}</span>

                     </p>`

                ).join('');

                bibleContent.innerHTML = contentHtml;

                bibleContent.focus({ preventScroll: true });

            } else {

                 bibleContent.innerHTML = `<p class="text-warning fst-italic text-center mt-4">Conteúdo não encontrado para ${currentBookName} ${chapterNum}.</p>`;

                 const bookInfo = booksData.find(b => b.id === bookId);

                 if (!bookInfo || chapterNum > bookInfo.chapterCount) {

                     console.warn(`Capítulo ${chapterNum} solicitado além dos capítulos (${bookInfo?.chapterCount}) para ${bookId}`);

                 }

            }

        } catch (error) {

            console.error(`Falha ao carregar capítulo ${bookId} ${chapterNum}:`, error);

            bibleContent.innerHTML = `<p class="text-danger fst-italic text-center mt-4">Falha ao carregar capítulo. Verifique console. Detalhes: ${error.message}</p>`;

        } finally {

            bibleContent.setAttribute('aria-busy', 'false');

            updateUI();

            window.scrollTo({ top: 0, behavior: 'smooth' });

        }

    }



    function updateUI() {

        if (chapterTitle) {

            chapterTitle.textContent = (currentBookName && currentChapter)

                ? `${currentBookName} ${currentChapter}`

                : "Selecione Livro e Capítulo";

        }

        if (selectChapterBtn) selectChapterBtn.disabled = !currentBookId;

        if (decreaseFontBtn) decreaseFontBtn.disabled = currentFontSizeStep === 0;

        if (increaseFontBtn) increaseFontBtn.disabled = currentFontSizeStep === FONT_STEPS.length - 1;



        let prevRefText = '';

        let nextRefText = '';

        let isPrevDisabled = true;

        let isNextDisabled = true;



        if (currentBookId && currentChapter && booksData.length > 0) {

            const currentBookIndex = booksData.findIndex(b => b.id === currentBookId);



            if (currentBookIndex !== -1) {

                 if (currentChapter > 1) {

                     isPrevDisabled = false;

                     prevRefText = `${currentBookName} ${currentChapter - 1}`;

                 } else if (currentBookIndex > 0) {

                     isPrevDisabled = false;

                     const prevBook = booksData[currentBookIndex - 1];

                     prevRefText = `${prevBook.name} ${prevBook.chapterCount}`;

                 } else { prevRefText = 'Início'; }



                 if (currentChapter < currentBookChapterCount) {

                     isNextDisabled = false;

                     nextRefText = `${currentBookName} ${currentChapter + 1}`;

                 } else if (currentBookIndex < booksData.length - 1) {

                     isNextDisabled = false;

                     const nextBook = booksData[currentBookIndex + 1];

                     nextRefText = `${nextBook.name} 1`;

                 } else { nextRefText = 'Fim'; }

            }

        }



        if (prevChapterBtn) {

             prevChapterBtn.disabled = isPrevDisabled;

             const prevRefSpan = prevChapterBtn.querySelector('.button-nav-ref');

             if (prevRefSpan) prevRefSpan.textContent = prevRefText;

             prevChapterBtn.title = isPrevDisabled ? '' : `Ir para ${prevRefText}`;

        }

        if (nextChapterBtn) {

             nextChapterBtn.disabled = isNextDisabled;

             const nextRefSpan = nextChapterBtn.querySelector('.button-nav-ref');

             if (nextRefSpan) nextRefSpan.textContent = nextRefText;

             nextChapterBtn.title = isNextDisabled ? '' : `Ir para ${nextRefText}`;

        }

    }



    function navigatePrev() {

        if (prevChapterBtn?.disabled) return;



        if (currentChapter > 1) {

            selectChapter(currentChapter - 1);

        } else {

            const currentBookIndex = booksData.findIndex(b => b.id === currentBookId);

            if (currentBookIndex > 0) {

                const prevBook = booksData[currentBookIndex - 1];

                selectBook(prevBook.id, prevBook.name, prevBook.chapterCount);

                setTimeout(() => {

                    if(currentBookId === prevBook.id) {

                        selectChapter(prevBook.chapterCount);

                    }

                }, 100);

            }

        }

    }



    function navigateNext() {

        if (nextChapterBtn?.disabled) return;



        if (currentChapter < currentBookChapterCount) {

            selectChapter(currentChapter + 1);

        } else {

            const currentBookIndex = booksData.findIndex(b => b.id === currentBookId);

            if (currentBookIndex < booksData.length - 1) {

                const nextBook = booksData[currentBookIndex + 1];

                selectBook(nextBook.id, nextBook.name, nextBook.chapterCount);

            }

        }

    }



    function applyFontSize(stepIndex) {

        if (!bibleContent || !fontSizeValue || stepIndex < 0 || stepIndex >= FONT_STEPS.length) return;



        currentFontSizeStep = stepIndex;

        const isMobile = window.innerWidth < 768;

        const fontSize = isMobile ? FONT_SIZES_MOBILE[currentFontSizeStep] : FONT_SIZES[currentFontSizeStep];

        const fontLabel = FONT_SIZE_LABELS[currentFontSizeStep];



        bibleContent.style.fontSize = fontSize;

        fontSizeValue.textContent = fontLabel;



        if (decreaseFontBtn) decreaseFontBtn.disabled = currentFontSizeStep === 0;

        if (increaseFontBtn) increaseFontBtn.disabled = currentFontSizeStep === FONT_STEPS.length - 1;



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

         if (!verseElement || !navigator.clipboard) return;



         const verseNum = verseElement.dataset.verse;

         const verseTextElement = verseElement.nextElementSibling?.matches('.verse-text') ? verseElement.nextElementSibling : null;

         const verseText = verseTextElement ? verseTextElement.textContent.trim() : '';



         if (verseNum && verseText && currentBookName && currentChapter) {

             const textToCopy = `${currentBookName} ${currentChapter}:${verseNum} - ${verseText}`;

             navigator.clipboard.writeText(textToCopy)

                 .then(() => {

                     console.log("Versículo copiado:", textToCopy);

                     if (copiedToast) copiedToast.show();

                 })

                 .catch(err => {

                     console.error("Falha ao copiar versículo:", err);

                     alert("Erro ao copiar o versículo. Verifique as permissões do navegador.");

                 });

         } else {

              console.warn("Dados incompletos para copiar versículo:", {verseNum, verseText, currentBookName, currentChapter});

         }

     }



     function saveLastReadPosition() {

        if (currentBookId && currentChapter) {

            try {

                const lastRead = {

                    bookId: currentBookId,

                    chapter: currentChapter,

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

                if (lastRead.bookId && lastRead.chapter && booksData.some(b => b.id === lastRead.bookId)) {

                     currentBookId = lastRead.bookId;

                     currentBookName = lastRead.bookName || booksData.find(b => b.id === lastRead.bookId)?.name;

                     currentBookChapterCount = lastRead.chapterCount || booksData.find(b => b.id === lastRead.bookId)?.chapterCount;

                     const chapterToLoad = parseInt(lastRead.chapter, 10);



                     if (selectBookBtn && currentBookName) {

                         selectBookBtn.innerHTML = `<i class="bi bi-book-fill me-1"></i><span class="d-none d-sm-inline">${currentBookName}</span>`;

                         selectBookBtn.title = currentBookName;

                     }

                     if (selectChapterBtn) selectChapterBtn.disabled = false;



                     selectChapter(chapterToLoad);

                     console.log(`Posição restaurada: ${currentBookName} ${currentChapter}`);

                     return true;

                } else {

                    console.warn("Dados salvos de última leitura inválidos.");

                    localStorage.removeItem(LAST_READ_KEY);

                }

            }

        } catch (e) {

            console.error("Erro ao carregar última posição:", e);

             localStorage.removeItem(LAST_READ_KEY);

        }

        return false;

    }



    function loadFontSizePreference() {

         try {

             const savedStep = localStorage.getItem(FONT_SIZE_KEY);

             if (savedStep !== null) {

                 const stepIndex = parseInt(savedStep, 10);

                 if (!isNaN(stepIndex) && stepIndex >= 0 && stepIndex < FONT_STEPS.length) {

                     applyFontSize(stepIndex);

                     console.log(`Tamanho da fonte restaurado: passo ${stepIndex}`);

                     return;

                 } else {

                      console.warn("Valor salvo de tamanho da fonte inválido.");

                      localStorage.removeItem(FONT_SIZE_KEY);

                 }

             }

         } catch (e) {

             console.error("Erro ao carregar pref. de tamanho da fonte:", e);

             localStorage.removeItem(FONT_SIZE_KEY);

         }

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

                await parseAndStoreXML();

                console.log("Parse e armazenamento concluídos.");

            } else {

                 if (initializationMessage) initializationMessage.classList.add('hidden');

            }



            const books = await getBookListFromDB();

            if (books.length === 0 && !isInitialized) {

                 throw new Error("Falha crítica: DB vazio após tentativa de inicialização.");

            }

            console.log(`Carregados ${books.length} livros.`);



            populateBookListUI(books);

            loadFontSizePreference();



            const restoredPosition = loadLastReadPosition();



            if (!restoredPosition && books.length > 0) {

                console.log("Carregando padrão (Gênesis 1).");

                const firstBook = booksData[0];

                if (firstBook) {

                    selectBook(firstBook.id, firstBook.name, firstBook.chapterCount);

                } else {

                     throw new Error("Não foi possível encontrar o primeiro livro.");

                }

            } else if (books.length === 0) {

                 chapterTitle.textContent = "Nenhum livro carregado";

                 bibleContent.innerHTML = '<p class="text-danger text-center mt-4">Não foi possível carregar livros. Verifique XML e recarregue.</p>';

                 selectBookBtn.disabled = true;

                 selectChapterBtn.disabled = true;

                 prevChapterBtn.disabled = true;

                 nextChapterBtn.disabled = true;

                 optionsMenuBtn.disabled = true;

            }



            updateUI();



        } catch (error) {

            console.error("Erro fatal na inicialização:", error);

            if (chapterTitle) chapterTitle.textContent = "Erro na Inicialização";

            if (bibleContent) bibleContent.innerHTML = `<div class="alert alert-danger mt-4">Erro ao inicializar: ${error.message}. Recarregue ou verifique console.</div>`;

            if (initializationMessage) initializationMessage.classList.add('hidden');

            if (selectBookBtn) selectBookBtn.disabled = true;

            if (selectChapterBtn) selectChapterBtn.disabled = true;

            if (prevChapterBtn) prevChapterBtn.disabled = true;

            if (nextChapterBtn) nextChapterBtn.disabled = true;

             if (optionsMenuBtn) optionsMenuBtn.disabled = true;

        }

    }



    if (prevChapterBtn) prevChapterBtn.addEventListener('click', navigatePrev);

    if (nextChapterBtn) nextChapterBtn.addEventListener('click', navigateNext);



    if (selectBookBtn) {

        selectBookBtn.addEventListener('click', () => {

             if (bookSearchInput) bookSearchInput.value = '';

             filterBooks();

             bookSelectModal.show();

        });

    }

     if (bookSearchInput) {

         bookSearchInput.addEventListener('input', filterBooks);

         bookSelectModalEl?.addEventListener('hidden.bs.modal', () => {

             bookSearchInput.value = '';

         });

     }

     if (modalBookList) {

         modalBookList.addEventListener('click', (event) => {

             if (event.target.tagName === 'A' && event.target.dataset.bookId) {

                 event.preventDefault();

                 const { bookId, bookName, chapters } = event.target.dataset;

                 selectBook(bookId, bookName, parseInt(chapters, 10));

             }

         });

     }



    if (selectChapterBtn) {

        selectChapterBtn.addEventListener('click', () => {

             if (currentBookId && currentBookChapterCount > 0) {

                 populateChapterGridUI(currentBookName, currentBookChapterCount, currentChapter);

                 chapterSelectModal.show();

                 setTimeout(() => {

                     const activeBtn = chapterGrid.querySelector('.chapter-grid-btn.active') || chapterGrid.querySelector('.chapter-grid-btn');

                     activeBtn?.focus();

                 }, 200);

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

     }



    if (decreaseFontBtn) decreaseFontBtn.addEventListener('click', decreaseFontSize);

    if (increaseFontBtn) increaseFontBtn.addEventListener('click', increaseFontSize);



    if (bibleContent) {

        bibleContent.addEventListener('click', (event) => {

             const verseRefElement = event.target.closest('.verse-ref');

             if (verseRefElement) {

                 copyVerseToClipboard(verseRefElement);

             }

        });

         bibleContent.addEventListener('keydown', (event) => {

             if (event.key === 'Enter' || event.key === ' ') {

                 const verseRefElement = event.target.closest('.verse-ref');

                 if (verseRefElement && document.activeElement === verseRefElement) {

                      event.preventDefault();

                      copyVerseToClipboard(verseRefElement);

                 }

             }

         });

    }



    initializeApp();



});
