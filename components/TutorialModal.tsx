'use client';

import { useEffect, useState } from 'react';

const TUTORIAL_KEY = 'peerbridge_tutorial_seen';

interface TutorialModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function TutorialModal({ isOpen: externalIsOpen, onClose }: TutorialModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsOpen(externalIsOpen);
    } else {
      // Check first-time visitor in localStorage
      if (typeof window !== 'undefined') {
        const seen = localStorage.getItem(TUTORIAL_KEY);
        if (!seen) {
          setIsOpen(true);
        }
      }
    }
  }, [externalIsOpen]);

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TUTORIAL_KEY, 'true');
    }
    setIsOpen(false);
    if (onClose) onClose();
  }

  const steps = [
    {
      badge: 'Step 1 of 4',
      icon: '📁',
      title: 'Select Files or Type Text',
      description: 'Choose files (PDF, ZIP, Videos, Images, Datasets) or select the Text tab to type/paste code snippets and notes to share.'
    },
    {
      badge: 'Step 2 of 4',
      icon: '🔢',
      title: 'Generate Your 6-Digit Code',
      description: 'Click "Generate Transfer Code" to allocate a secure, temporary 6-digit room code for your receiver.'
    },
    {
      badge: 'Step 3 of 4',
      icon: '📲',
      title: 'Enter Code on Receiver Device',
      description: 'On the receiver device (phone, laptop, desktop, tablet), open PeerBridge and enter the 6-digit code to connect.'
    },
    {
      badge: 'Step 4 of 4',
      icon: '⚡',
      title: 'Stream Files & 1-Click Copy',
      description: 'Review and approve the connection on sender. Files stream directly browser-to-browser, and text snippets can be copied with 1-click!'
    }
  ];

  if (!isOpen) return null;

  const step = steps[currentStep];

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="PeerBridge Usage Tutorial">
      <div className="tutorialModalCard">
        <div className="tutorialHeader">
          <span className="tutorialStepBadge">{step.badge}</span>
          <button
            type="button"
            className="modalCloseBtn"
            onClick={handleDismiss}
            aria-label="Close tutorial"
          >
            ✕
          </button>
        </div>

        <div className="tutorialBody">
          <div className="tutorialIconBox">{step.icon}</div>
          <h3 className="tutorialTitle">{step.title}</h3>
          <p className="tutorialDesc">{step.description}</p>

          <div className="tutorialStepDots">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`stepDot ${idx === currentStep ? 'dotActive' : ''}`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="tutorialFooter">
          <div className="footerLeft">
            <button
              type="button"
              className="button buttonGhost buttonSmall skipBtn"
              onClick={handleDismiss}
              title="Skip tutorial and dismiss"
            >
              Skip
            </button>
            {currentStep > 0 && (
              <button
                type="button"
                className="button buttonGhost buttonSmall"
                onClick={() => setCurrentStep((prev) => prev - 1)}
              >
                ← Back
              </button>
            )}
          </div>

          <div className="footerRight">
            {currentStep < steps.length - 1 ? (
              <button
                type="button"
                className="button buttonPrimary buttonSmall"
                onClick={() => setCurrentStep((prev) => prev + 1)}
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                className="button buttonGlow buttonSmall"
                onClick={handleDismiss}
              >
                Got it! Let's Start 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
