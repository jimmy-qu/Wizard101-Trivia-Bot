// Global variables
let currentQuestion = null;
let currentAnswers = [];
let currentSection = 'magical';
let debugMode = false;
let lastDetection = {};
let database = {};

// DOM elements
const resultDiv = document.getElementById('result');
const debugLog = document.getElementById('debug-log');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const debugToggle = document.getElementById('debug-toggle');
const copyDebugBtn = document.getElementById('copy-debug');

// Load the trivia database
fetch(chrome.runtime.getURL('database.json'))
  .then(response => response.json())
  .then(data => {
    database = data;
    logDebug('Database loaded with sections:', Object.keys(data.sections));
  })
  .catch(err => {
    logDebug('Database load error:', err);
  });

// Debug mode toggle
debugToggle.addEventListener('change', (e) => {
  debugMode = e.target.checked;
  debugLog.style.display = debugMode ? 'block' : 'none';
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "TOGGLE_DEBUG",
        enabled: debugMode
      });
    }
  });
});

// Copy debug info
copyDebugBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(JSON.stringify(lastDetection, null, 2));
  statusText.textContent = 'Debug info copied!';
  setTimeout(() => {
    statusText.textContent = debugMode ? 'Monitoring...' : 'Waiting for question...';
  }, 2000);
});

// Update detection status
function updateDetectionStatus(detected = false) {
  if (detected) {
    statusIcon.classList.add('active');
    statusText.textContent = 'Question detected!';
    setTimeout(() => {
      if (!debugMode) updateDetectionStatus(false);
    }, 3000);
  } else {
    statusIcon.classList.remove('active');
    statusText.textContent = debugMode ? 'Monitoring...' : 'Waiting for question...';
  }
}

// Debug logging
function logDebug(...args) {
  if (!debugMode) return;
  const timestamp = new Date().toLocaleTimeString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
  ).join(' ');
  
  debugLog.textContent += `[${timestamp}] ${message}\n`;
  debugLog.scrollTop = debugLog.scrollHeight;
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TRIVIA_DETECTED") {
    lastDetection = request;
    currentQuestion = request.question;
    currentAnswers = request.answers;
    
    updateDetectionStatus(true);
    logDebug('Detected:', {
      question: request.question,
      answers: request.answers,
      url: request.url,
      timestamp: request.timestamp
    });

    // Determine section
    currentSection = identifySection(request.question);
    
    // Find and display answer
    const result = findAnswer(request.question, currentSection, request.answers);
    displayResult(result);
  }
});

// Section identification
function identifySection(question) {
  const lowerQ = question.toLowerCase();
  
  if (lowerQ.includes('summon') || lowerQ.includes('spirit') || lowerQ.includes('shaman')) {
    return 'conjuring';
  }
  if (lowerQ.includes('damage') || lowerQ.includes('spell') || lowerQ.includes('pvp')) {
    return 'adventuring';
  }
  return 'magical'; // Default
}

// Answer finding
function findAnswer(question, section, displayedAnswers = []) {
  if (!database.sections) return null;
  
  const sectionKey = `${section}_trivia`;
  const questions = database.sections[sectionKey]?.questions || [];
  
  // Try exact match first
  const exactMatch = questions.find(q => 
    cleanText(q.question) === cleanText(question)
  );
  if (exactMatch) return formatAnswer(exactMatch, displayedAnswers);
  
  // Try keyword matching
  const keywordMatch = questions.find(q => 
    q.keywords?.some(keyword => 
      question.toLowerCase().includes(keyword.toLowerCase())
    )
  );
  if (keywordMatch) return formatAnswer(keywordMatch, displayedAnswers);
  
  // Try partial matching
  const questionWords = cleanText(question).split(' ');
  const partialMatch = questions.find(q => {
    const dbQuestion = cleanText(q.question);
    return questionWords.some(word => 
      word.length > 3 && dbQuestion.includes(word)
    );
  });
  
  return partialMatch ? formatAnswer(partialMatch, displayedAnswers) : null;
}

function formatAnswer(dbItem, displayedAnswers) {
  if (!dbItem) return null;
  
  const correctAnswers = Array.isArray(dbItem.answers) 
    ? dbItem.answers 
    : [dbItem.answers];
  
  // Find which displayed answers match
  const matchedAnswers = displayedAnswers.map((ans, index) => {
    const isCorrect = correctAnswers.some(correctAns =>
      cleanText(ans).includes(cleanText(correctAns)) ||
      cleanText(correctAns).includes(cleanText(ans))
    );
    return isCorrect ? { answer: ans, index } : null;
  }).filter(Boolean);
  
  return {
    section: dbItem.section,
    question: dbItem.question,
    correctAnswers: correctAnswers,
    matchedAnswers: matchedAnswers,
    metadata: dbItem.metadata || {}
  };
}

// Display results
function displayResult(result) {
  if (!result) {
    resultDiv.innerHTML = `
      <div class="unknown-question">
        <h3>Unknown Question</h3>
        <p>${currentQuestion}</p>
        <button id="report-btn">Report Missing Question</button>
      </div>
    `;
    document.getElementById('report-btn').addEventListener('click', reportQuestion);
    return;
  }

  let answersHtml = '';
  if (result.matchedAnswers.length > 0) {
    answersHtml = `
      <div class="correct-answers">
        <h3>Correct Answer${result.matchedAnswers.length > 1 ? 's' : ''}:</h3>
        ${result.matchedAnswers.map(match => `
          <div class="correct-answer" data-answer-index="${match.index}">
            ${match.answer}
          </div>
        `).join('')}
      </div>
    `;
  } else {
    answersHtml = `
      <div class="correct-answers">
        <h3>Possible Answer${result.correctAnswers.length > 1 ? 's' : ''}:</h3>
        ${result.correctAnswers.map(answer => `
          <div class="correct-answer">${answer}</div>
        `).join('')}
        <small>No exact match found in displayed options</small>
      </div>
    `;
  }

  resultDiv.innerHTML = `
    <div class="result-container">
      <span class="section-tag">${currentSection.toUpperCase()}</span>
      <h2>${result.question}</h2>
      ${answersHtml}
      ${result.metadata.note ? `<div class="note">Note: ${result.metadata.note}</div>` : ''}
    </div>
  `;

  // Add click handlers for matched answers
  document.querySelectorAll('[data-answer-index]').forEach(el => {
    el.addEventListener('click', () => {
      const index = el.getAttribute('data-answer-index');
      chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          func: clickAnswer,
          args: [index]
        });
      });
    });
  });
}

// Answer clicking function (injected into page)
function clickAnswer(index) {
  const answerElements = document.querySelectorAll('.quizAnswerOption, .trivia-option');
  if (answerElements[index]) {
    answerElements[index].click();
    console.log(`Selected answer: ${answerElements[index].textContent.trim()}`);
  }
}

// Report missing question
function reportQuestion() {
  chrome.runtime.sendMessage({
    type: "REPORT_QUESTION",
    question: currentQuestion,
    section: currentSection,
    answers: currentAnswers,
    timestamp: new Date().toISOString()
  });
  resultDiv.innerHTML = `
    <div class="report-thanks">
      <p>Question reported for addition!</p>
      <p>Thank you for contributing.</p>
    </div>
  `;
}

// Text cleaning utility
function cleanText(text) {
  return String(text).trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, '');
}

// Initialize
updateDetectionStatus();