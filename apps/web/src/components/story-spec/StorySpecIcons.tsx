import type { JSX } from "react";

export function FolderIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h6l1.5 2.25h9v8.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z" />
    </svg>
  );
}

export function ChevronIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {expanded ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
      )}
    </svg>
  );
}

export function PlusIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export function StoryIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 4.5h10.5A1.5 1.5 0 0 1 18.75 6v12a1.5 1.5 0 0 1-1.5 1.5H6.75A1.5 1.5 0 0 1 5.25 18V6a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25h7.5M8.25 12h7.5M8.25 15.75h4.5" />
    </svg>
  );
}

export function SpecIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75h6L18 8.25v12H7.5a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.75v4.5H18M9 12h6M9 15h6M9 18h3" />
    </svg>
  );
}

export function RocketIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 4.5c2.25-.75 4.5-.75 5.25 0 .75.75.75 3 0 5.25-.64 1.92-2.08 4.06-4.02 6L12 12.27l-3.48-3.48c1.94-1.94 4.08-3.38 5.73-4.29Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H5.25L3.75 12l3 1.5M15 15v3.75l-3 1.5-1.5-3M9.75 14.25l-3 3M15 8.25h.008" />
    </svg>
  );
}

export function LockIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5V7.875a3.75 3.75 0 1 1 7.5 0V10.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 10.5h10.5A1.5 1.5 0 0 1 18.75 12v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}

export function EditIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

export function EyeIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
    </svg>
  );
}

export function TrashIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916A2.25 2.25 0 0 0 13.5 2.25h-3A2.25 2.25 0 0 0 8.25 4.5v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}
