import { Link, useNavigate } from "react-router-dom";

interface HeaderProps {
  title: string;
  back?: string;
  action?: React.ReactNode;
}

export default function Header({ title, back, action }: HeaderProps) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 bg-white/80 backdrop-blur border-b border-neutral-200 z-30 flex items-center gap-2 px-3 py-3">
      {back ? (
        <Link
          to={back}
          className="w-9 h-9 flex items-center justify-center text-neutral-600 rounded-full hover:bg-neutral-100"
          aria-label="返回"
        >
          ‹
        </Link>
      ) : (
        <button
          onClick={() => nav(-1)}
          className="w-9 h-9 flex items-center justify-center text-neutral-600 rounded-full hover:bg-neutral-100"
          aria-label="返回"
        >
          ‹
        </button>
      )}
      <h1 className="text-base font-semibold flex-1 truncate">{title}</h1>
      {action}
    </header>
  );
}
