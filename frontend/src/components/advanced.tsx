import { motion } from 'framer-motion';
import { ReactNode, useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Componente Modal
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`bg-dark-800 rounded-xl border border-dark-700 w-full ${sizes[size]}`}
      >
        <div className="flex justify-between items-center p-6 border-b border-dark-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-dark-300 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
};

/**
 * Componente Toast/Notification
 */
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

export const Toast = ({
  message,
  type = 'info',
}: ToastProps) => {
  const bgColors = {
    success: 'bg-green-500/20 border-green-500/30 text-green-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400',
    warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    info: 'bg-primary-500/20 border-primary-500/30 text-primary-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`fixed top-4 right-4 px-6 py-4 rounded-lg border ${bgColors[type]} z-50 max-w-md`}
    >
      {message}
    </motion.div>
  );
};

/**
 * Componente Skeleton/Loading
 */
export const Skeleton = ({
  className = '',
  count = 1,
}: {
  className?: string;
  count?: number;
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`bg-dark-700 animate-pulse rounded-lg ${className}`}
        />
      ))}
    </>
  );
};

/**
 * Componente Input
 */
interface InputProps {
  label?: string;
  placeholder?: string;
  type?: string;
  error?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

export const Input = ({
  label,
  placeholder,
  type = 'text',
  error,
  value,
  onChange,
  className = '',
}: InputProps) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-dark-300 mb-2">
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`
          w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-600
          text-white placeholder-dark-400 focus:outline-none
          focus:border-primary-500 transition-colors
          ${error ? 'border-red-500' : ''}
          ${className}
        `}
      />
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
};

/**
 * Componente Select
 */
interface SelectProps {
  label?: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export const Select = ({
  label,
  options,
  value,
  onChange,
  className = '',
}: SelectProps) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-dark-300 mb-2">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className={`
          w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-600
          text-white focus:outline-none focus:border-primary-500
          transition-colors ${className}
        `}
      >
        <option value="">Seleccionar...</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Componente Tabs
 */
interface Tab {
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: number;
  onChange?: (index: number) => void;
}

export const Tabs = ({
  tabs,
  defaultTab = 0,
  onChange,
}: TabsProps) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = (index: number) => {
    setActiveTab(index);
    onChange?.(index);
  };

  return (
    <div className="w-full">
      <div className="flex border-b border-dark-700 mb-6">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => handleTabChange(index)}
            className={`
              px-4 py-3 font-medium transition-colors border-b-2
              ${
                activeTab === index
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-dark-400 hover:text-dark-300'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {tabs[activeTab].content}
      </motion.div>
    </div>
  );
};
