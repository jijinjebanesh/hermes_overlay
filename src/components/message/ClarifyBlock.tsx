import React from 'react';
import { HelpCircle, ArrowRight, Check, CornerDownRight } from 'lucide-react';

interface ClarifyBlockProps {
  question: string;
  answer?: string;
  choices?: string[];
  multiSelect?: boolean;
  onAnswer?: (answer: string | string[]) => void;
}

export const ClarifyBlock: React.FC<ClarifyBlockProps> = ({ question, answer, choices, multiSelect, onAnswer }) => {
  const hasChoices = choices && choices.length > 0;
  const hasAnswer = !!answer;

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
                className="hermes-clarify-choice"
                onClick={() => onAnswer?.(choice)}
              >
                <CornerDownRight size={12} className="hermes-clarify-choice-icon" />
                <span>{choice}</span>
              </button>
            ))}
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
