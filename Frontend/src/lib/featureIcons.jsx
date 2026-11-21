import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Columns3,
  CreditCard,
  DoorOpen,
  Download,
  FileText,
  FolderOpen,
  Home,
  IdCard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  Repeat,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Smartphone,
  Store,
  Target,
  TrendingUp,
  Users,
  User,
  UserRound,
  Dumbbell,
} from 'lucide-react';

/** Map access-catalog / semantic icon keys → Lucide components */
export const FEATURE_ICONS = {
  DoorOpen,
  Users,
  IdCard,
  LayoutDashboard,
  User,
  Phone,
  MessageCircle,
  ClipboardList,
  Columns3,
  Repeat,
  Smartphone,
  Lock,
  FolderOpen,
  UserRound,
  RefreshCw,
  Package,
  Download,
  Target,
  CheckCircle2,
  MessageSquare,
  TrendingUp,
  BookOpen,
  ScrollText,
  Mail,
  Banknote,
  Dumbbell,
  FileText,
  Home,
  Building2,
  Settings,
  KeyRound,
  Shield,
  Briefcase,
  Calendar,
  CreditCard,
  AlertTriangle,
  BadgeCheck,
  ArrowLeftRight,
  Inbox,
  ShoppingCart,
  Receipt,
  Store,
};

export function FeatureIcon({ name, size = 20, className, style, strokeWidth = 2, ...rest }) {
  const Icon = FEATURE_ICONS[name] || Inbox;
  return (
    <Icon
      size={size}
      className={className}
      style={{ color: 'var(--icon, var(--navy))', ...style }}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...rest}
    />
  );
}

export function resolveFeatureIcon(name) {
  return FEATURE_ICONS[name] || Inbox;
}
