'use client';

import { useEffect, useRef, useState } from 'react';

const TUTORIAL_KEY = 'peerbridge_tutorial_seen_v1';

interface TutorialModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  autoOpenOnLanding?: boolean;
}

export default function TutorialModal({
  isOpen: externalIsOpen,
  onClose,
  autoOpenOnLanding = false
}: TutorialModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsOpen(externalIsOpen);
      if (externalIsOpen) setCurrentStep(0);
    }
  }, [externalIsOpen]);

  useEffect(() => {
    if (autoOpenOnLanding && externalIsOpen === undefined) {
      try {
        if (typeof window !== 'undefined') {
          const seen = localStorage.getItem(TUTORIAL_KEY);
          if (!seen) {
            setIsOpen(true);
          }
        }
      } catch {}
    }
  }, [autoOpenOnLanding, externalIsOpen]);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

      const timer = setTimeout(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleDismiss();
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusables = modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  function handleDismiss() {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(TUTORIAL_KEY, 'true');
      }
    } catch {}
    setIsOpen(false);
    if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus();
    }
    if (onClose) onClose();
  }

  const steps = [
    {
      badge: 'Step 1 of 4',
      icon: '🎯',
      title: 'Step 1 — Choose an Action',
      description: 'Select "Send Files & Text" or "Receive Files."'
    },
    {
      badge: 'Step 2 of 4',
      icon: '🔢',
      title: 'Step 2 — Generate a Code',
      description: 'The sender selects files or enters text, then generates a temporary 6-digit code.'
    },
    {
      badge: 'Step 3 of 4',
      icon: '📲',
      title: 'Step 3 — Connect the Receiver',
      description: 'The receiver opens the Receive page and enters the code in XXX-XXX format.'
    },
    {
      badge: 'Step 4 of 4',
      icon: '⚡',
      title: 'Step 4 — Approve and Transfer',
      description: 'The sender clicks "Approve & Send" once. The receiver is automatically accepted and the transfer starts. Do not show a second receiver approval button.'
    }
  ];

  if (!isOpen) return null;

  const step = steps[currentStep];

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="How to Use PeerBridge Tutorial">
      <div className="tutorialModalCard" ref={modalRef}>
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

          <div className="tutorialStepDots" role="group" aria-label="Tutorial progress indicators">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`stepDot ${idx === currentStep ? 'dotActive' : ''}`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to step ${idx + 1} of 4`}
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
                Start Sharing 🚀
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
