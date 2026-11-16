import { useEffect } from 'react';

/** Сколько висит всплывающее сообщение, мс. */
const TOAST_MS = 3000;

interface Props {
  message: string | null;
  onClose: () => void;
}

/** Всплывающее сообщение о мгновенном отказе действия; само исчезает через 3 с. */
export default function Toast({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
