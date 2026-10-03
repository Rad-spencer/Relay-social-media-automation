import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  X,
  Instagram,
  Facebook,
  Youtube,
  MessageCircle,
  ArrowUpRight,
  Inbox,
} from "lucide-react";
import type { Platform } from "../../shared/types";
export function PlatformIcon({ platform }: { platform: Platform }) {
  const Icon =
    platform === "instagram"
      ? Instagram
      : platform === "facebook"
        ? Facebook
        : platform === "youtube"
          ? Youtube
          : MessageCircle;
  return (
    <span className={`platform-icon ${platform}`} title={platform}>
      <Icon size={16} />
    </span>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const hue = [210, 260, 165, 30, 330][name.charCodeAt(0) % 5];
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{
        background: `hsl(${hue} 70% 94%)`,
        color: `hsl(${hue} 50% 35%)`,
      }}
    >
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
export function relative(date: string) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  return diff < 60000
    ? "Just now"
    : diff < 3600000
      ? `${Math.floor(diff / 60000)}m`
      : diff < 86400000
        ? `${Math.floor(diff / 3600000)}h`
        : `${Math.floor(diff / 86400000)}d`;
}
