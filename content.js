let triviaSet = []; // default to an empty array instead of null

fetch(chrome.runtime.getURL('database.json'))
  .then(response => response.json())
  .then(data => {
    // Flatten all trivia section questions into one array
    const sections = data.sections;
    triviaSet = Object.values(sections)
      .map(section => section.questions || [])
      .flat();
    

    if (!triviaSet) {
      console.error("No trivia questions found.");
      return;
    }

    // Now we can safely start observing
    const observer = new MutationObserver(checkForAnswers);
    observer.observe(document.body, { subtree: true, childList: true });

    // Initial run
    checkForAnswers();

    // Optional interval as fallback
    const interval = setInterval(checkForAnswers, CHECK_INTERVAL);
    window.addEventListener('beforeunload', () => {
      clearInterval(interval);
      observer.disconnect();
    });
  })
  .catch(err => console.error("Failed to load database:", err));

// 1. CONFIGURATION
const DEBUG = true;
const CHECK_INTERVAL = 1500;
const HIGHLIGHT_COLOR = '#4CAF50';

// 2. PRECISE SELECTORS (updated based on your output)
const ANSWER_SELECTORS = [
    'div.answer', // This is the correct selector based on your output
    'div.answerOption' // Backup selector
];


function normalize(text) {
  return String(text)  // force string conversion for numbers
    .toLowerCase()
    .trim()
    .replace(/[“”"'.,!?;:()\[\]{}]/g, '')
    .replace(/\s+/g, ' ');
}

function detectAnswers(correctAnswers = []) {
  try {
    const container = document.querySelector('.answersContainer');
    if (!container) return [];

    const answers = new Map();

    ANSWER_SELECTORS.forEach(selector => {
      container.querySelectorAll(selector).forEach(el => {
        const text = cleanAnswerText(el);
        if (DEBUG) {
          console.log(`🧪 Raw Answer Text: "${el.textContent.trim()}" → Cleaned: "${text}"`);
        }
        const normalizedText = normalize(text);
        if (isValidAnswer(text) && !answers.has(normalizedText)) {
          answers.set(normalizedText, {
            element: el,
            text: text,
            selector: selector
          });
        }
      });
    });

    if (DEBUG && answers.size > 0) {
      console.group('Detected Answers');
      answers.forEach((value, text) => {
        console.log(`"${text}" (found with: ${value.selector})`);
      });
      console.groupEnd();
    }

    // Filter based on correct answers from the trivia
    const filteredAnswers = Array.from(answers.values()).filter(ans =>
      correctAnswers.some(correct =>
        normalize(correct) === normalize(ans.text)
      )
    );
    if (DEBUG) {
      correctAnswers.forEach(correct => {
        answers.forEach(({ text }) => {
          console.log(`Compare: "${normalize(correct)}" ↔ "${normalize(text)}"`);
        });
      });
    }


    if (DEBUG && filteredAnswers.length > 0) {
      console.group('Filtered Correct Answers');
      filteredAnswers.forEach(ans => {
        console.log(`"${ans.text}" (found with: ${ans.selector})`);
      });
      console.groupEnd();
    }

    return filteredAnswers;
  } catch (e) {
    console.error('Detection error:', e);
    return [];
  }
}

function getCorrectAnswersForQuestion(questionText, trivia = []) {
  const normQuestion = normalize(questionText);

  const entry = trivia.find(q => {
    const normQ = normalize(q.question);

    return q.exact_match
      ? normQ === normQuestion
      : normQ.includes(normQuestion) || normQuestion.includes(normQ);
  });

  return entry ? entry.answers : [];
}


// 4. TEXT CLEANING (improved)
function cleanAnswerText(el) {
  const answerSpan = el.querySelector('.answerText');
  return answerSpan ? answerSpan.textContent.trim() : el.textContent.trim();
}

// 5. VALIDATION (strict)
function isValidAnswer(text) {
    return text && text.length > 0 && 
           !text.match(/^[A-Z]\.\s*/); // Exclude "A. " prefixes
}

// 6. MAIN EXECUTION (same as before)
function checkForAnswers() {
    const questionText = document.querySelector('.quizQuestion')?.textContent.trim();
    if (!questionText) {
        if (DEBUG) console.warn("No question text found.");
        return;
    }

    const correctAnswers = getCorrectAnswersForQuestion(questionText, triviaSet);
    const detected = detectAnswers(correctAnswers);
    if (DEBUG) {
        console.log("Detected Answers:", detected.map(a => a.text));
    }

    if (DEBUG) {
        console.log("Current Question:", questionText);
        console.log("Correct Answers from Database:", correctAnswers);
    }

    if (detected && detected.length > 0) {
        clickCorrectAnswers(detected);
        clickNextQuestion();

        chrome.runtime.sendMessage({
            type: "TRIVIA_ANSWERS_DETECTED",
            answers: detected.map(a => a.text)
        });

        if (DEBUG) {
            detected.forEach(ans => {
                ans.element.style.outline = `2px solid ${HIGHLIGHT_COLOR}`;
                setTimeout(() => (ans.element.style.outline = ''), 2000);
            });
        }
    } else if (DEBUG) {
        console.warn("No correct answers matched on screen.");
    }
}

function clickCorrectAnswers(answers) {
    answers.forEach(ans => {
        // This is the visual checkbox that handles selection
        const checkboxLink = ans.element.querySelector('.answerBox .largecheckbox');
        if (!checkboxLink) {
            console.warn('No clickable checkbox found for answer:', ans.text);
            return;
        }

        // Simulate full mouse click interaction
        ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
            const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true
            });
            checkboxLink.dispatchEvent(event);
        });

        if (DEBUG) {
            checkboxLink.style.outline = '3px dashed red';
            console.log(`Clicked on: "${ans.text}"`);
        }
    });
}

function clickNextQuestion() {
    const nextBtn = document.getElementById('nextQuestion');
    if (nextBtn && nextBtn.offsetParent !== null) {
        nextBtn.click();

        if (DEBUG) {
            console.log("✅ Clicked 'Next Question!'");
            nextBtn.style.outline = '2px dashed lime';
        }
    } else if (DEBUG) {
        console.warn("⚠️ 'Next Question' button not found or not visible.");
    }
}

// Initialize
const observer = new MutationObserver(checkForAnswers);
observer.observe(document.body, { subtree: true, childList: true });
checkForAnswers();
const interval = setInterval(checkForAnswers, CHECK_INTERVAL);
window.addEventListener('beforeunload', () => {
    clearInterval(interval);
    observer.disconnect();
});