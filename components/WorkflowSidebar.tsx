'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface WorkflowSidebarProps {
  active: 'send' | 'receive';
}

const NAV_ITEMS = [
  { href: '/send', label: 'Share', icon: '↑' },
  { href: '/receive', label: 'Receive', icon: '↓' },
  { href: '/history', label: 'History', icon: '◷' },
  { href: '/settings', label: 'Settings', icon: '⚙' }
];

export default function WorkflowSidebar({ active }: WorkflowSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="workflowSidebar" aria-label="Transfer navigation">
      <span className="workflowSidebarLabel">Workspace</span>
      <nav>
        {NAV_ITEMS.map((item) => {
          const selected = item.href === `/${active}` || pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`workflowNavItem ${selected ? 'workflowNavItemActive' : ''}`}
              aria-current={selected ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="workflowPrivacyNote">
        <span aria-hidden="true">🔒</span>
        <p><strong>Private by design</strong>Files move directly between devices.</p>
      </div>
    </aside>
  );
}
