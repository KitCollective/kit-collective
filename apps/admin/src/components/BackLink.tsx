import { Link } from "react-router-dom";

type BackLinkProps = {
  to: string;
};

export function BackLink({ to }: BackLinkProps) {
  return (
    <Link to={to} className="icon-btn" aria-label="Back">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M10 3L5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
