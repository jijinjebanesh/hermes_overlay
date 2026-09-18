import React from 'react';
import { HelpCircle, ArrowRight } from 'lucide-react';

interface ClarifyBlockProps {
  question: string;
  answer?: string;
}

export const ClarifyBlock: React.FC<ClarifyBlockProps> = ({ question, answer }) => {
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
        {answer && (
          <div className="hermes-clarify-answer">
            <ArrowRight size={13} className="hermes-clarify-arrow" />
            <span className="hermes-clarify-answer-text">{answer}</span>
          </div>
        )}
      </div>
    </div>
  );
};
