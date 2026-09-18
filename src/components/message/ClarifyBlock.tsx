import React, { useState } from 'react';
import { HelpCircle, ArrowRight, CornerDownRight, Send, Check } from 'lucide-react';

interface ClarifyBlockProps {
  question: string;
  answer?: string;
  choices?: string[];
  multiSelect?: boolean;
  onAnswer?: (answer: string | string[]) => void;
}

export const ClarifyBlock: React.FC<ClarifyBlockProps> = ({ question, answer, choices, onAnswer }) => {
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const hasChoices = choices && choices.length > 0;
  const hasAnswer = !!answer;

  const handleChoiceClick = (choice: string) => {
    setSelectedChoice(choice);
    onAnswer?.(choice);
  };

  const handleSubmitText = () => {
    if (textAnswer.trim() && onAnswer) {
      onAnswer(textAnswer.trim());
      setTextAnswer('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitText();
    }
  };

  return (
    <div className="hermes-clarify-card">
      <div className="hermes-clarify-header">
        <span className="hermes-clarify-badge">
          <HelpCircle size={13} className="hermes-clarify-icon" />
          <span>Clarify</span>
        </span>
      </div>
      <div className="hermes-clarify-body">
        <div className="hermes-clarify-question">{question}</div>

        {hasChoices && !hasAnswer && (
          <div className="hermes-clarify-choices">
            {choices!.map((choice, idx) => (
              <button
                key={idx}
                className={`hermes-clarify-choice${selectedChoice === choice ? ' submitted' : ''}`}
                onClick={() => handleChoiceClick(choice)}
                disabled={selectedChoice !== null}
              >
                <CornerDownRight size={12} className="hermes-clarify-choice-icon" />
                <span>{choice}</span>
                {selectedChoice === choice && (
                  <span className="hermes-clarify-choice-check">
                    <Check size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {!hasChoices && !hasAnswer && (
          <div className="hermes-clarify-input-row">
            <input
              type="text"
              className="hermes-clarify-input"
              placeholder="Type your answer..."
              value={textAnswer}
              onChange={e => setTextAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              className="hermes-clarify-send"
              onClick={handleSubmitText}
              disabled={!textAnswer.trim()}
              title="Send answer"
            >
              <Send size={14} />
            </button>
          </div>
        )}

        {hasAnswer && (
          <div className="hermes-clarify-answer">
            <ArrowRight size={13} className="hermes-clarify-arrow" />
            <span className="hermes-clarify-answer-text">{answer}</span>
          </div>
        )}
      </div>
    </div>
  );
};
