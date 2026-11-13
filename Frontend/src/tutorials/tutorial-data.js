import { hasAccess } from '../lib/access';

export const ALL_TENANT_ROLES = [
  'Owner',
  'General Manager',
  'Sales Manager',
  'Sales',
  'Head Coach',
  'Coach',
  'Receptionist',
  'Accountant',
];

const CHECKIN_ROLES = ['Receptionist', 'Owner', 'General Manager', 'Sales Manager', 'Sales'];
const DIRECTORY_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant', 'Head Coach', 'Receptionist'];
const SALES_ROLES = ['Sales', 'Sales Manager', 'Owner', 'General Manager'];
const SALES_LEAD_ROLES = ['Sales Manager', 'Owner', 'General Manager'];
const COACH_ROLES = ['Coach', 'Head Coach'];
const ASSIGN_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Head Coach'];
const ASSIGNED_ROLES = ['Sales', 'Coach', 'Head Coach'];
const ACCOUNTING_ROLES = ['Accountant', 'Owner', 'General Manager'];
const CONTRACT_ROLES = ['Accountant', 'Owner', 'General Manager', 'Sales Manager'];
const TARGET_ROLES = ['Sales Manager', 'Owner', 'General Manager', 'Accountant'];
const REPORT_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Sales', 'Head Coach', 'Accountant'];
const ANALYTICS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Accountant'];
const MANAGEMENT_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Head Coach'];
const OWNER_ROLES = ['Owner', 'General Manager'];
const ACCESS_ROLES = ['Owner', 'General Manager', 'Sales Manager', 'Head Coach'];
const WHATSAPP_ROLES = ['Sales Manager', 'Owner', 'General Manager', 'Accountant', 'Head Coach'];
const REPORT_FEATURES = ['exec_analytics', 'sales_crm', 'funnels', 'business_intelligence'];

function step(title, description, target, route, fallback = 'main') {
  return { title, description, target, route, fallback };
}

function memberStep(title, description, target, memberTab) {
  return {
    title,
    description,
    target,
    route: '',
    memberTab,
    fallback: '[data-walkthrough="member-body"]',
  };
}

function subjectStep(title, description, target, subject, profileTab) {
  return {
    title,
    description,
    target,
    route: '',
    subject,
    profileTab,
    fallback: '[data-walkthrough="staff-body"]',
  };
}

function whatsappTemplatesRoute(user) {
  return user?.role === 'Head Coach' ? '/coach/whatsapp-templates' : '/sales/whatsapp-templates';
}

function accessRoute(user, tab) {
  const base = user?.role === 'Head Coach' ? '/management/access' : '/owner/access';
  return `${base}?tab=${tab}`;
}

export const FILTER_RESULTS_STATE = {
  filters: {
    search: '',
    statusFilter: 'all',
    kind: 'all',
    personId: '',
    packageFilter: 'all',
    genderFilter: 'all',
    transferTypeFilter: 'all',
    dateField: 'endDate',
    dateFrom: '',
    dateTo: '',
  },
};

const PACKAGE_ACTOR_ROLES = ['Sales Manager', 'Owner', 'Accountant', 'General Manager'];
const ROLE_DEFAULT_ROLES = ['Owner', 'General Manager', 'Sales Manager'];
const SALES_PROFILE_ROLES = ['Sales Manager', 'Owner', 'General Manager', 'Accountant'];
const RECEPTION_PROFILE_ROLES = ['Sales Manager', 'Owner', 'General Manager'];

const PROFILE_ROLES = ['Receptionist', 'Owner', 'Sales', 'Sales Manager', 'Coach', 'Head Coach', 'Accountant', 'General Manager'];
const FREEZE_ROLES = ['Receptionist', 'Owner', 'Sales', 'Sales Manager'];
const INVITE_ROLES = ['Sales', 'Sales Manager', 'Receptionist', 'Owner'];
const ALERT_ROLES = ['Receptionist', 'Sales', 'Sales Manager'];
const SALES_NOTE_ROLES = ['Sales', 'Sales Manager', 'Owner'];
const STAFF_ROLES = ['Sales Manager', 'Owner', 'General Manager'];
const TEAM_ROLES = ['Sales Manager', 'Owner', 'General Manager', 'Accountant'];
const GUEST_REPORT_ROLES = ['Owner', 'Sales Manager', 'Sales', 'Head Coach'];
const IMPORTED_ROLES = ['Owner', 'Sales Manager'];

export const tutorialSections = [
  {
    title: 'Getting around',
    scenarios: [
      {
        id: 'getting-around',
        title: 'Navigation and search',
        subtitle: 'Move between the pages you can open, find a member, and replay any guide',
        badge: 'Core',
        roles: ALL_TENANT_ROLES,
        keywords: ['navigation', 'tabs', 'search', 'help', 'menu', 'guides'],
        steps: [
          step(
            'Page tabs',
            'These tabs are the pages your role can open. On a phone they sit along the bottom of the screen. Anything missing here has been turned off for your account or this gym’s plan.',
            'tab-nav',
            '',
            '[data-walkthrough="mobile-nav"]',
          ),
          step(
            'Member search',
            'Search by name, phone, or system ID from any page. Open a result to jump straight to that member.',
            'global-search',
            '',
            '#mob-search-btn',
          ),
          step(
            'Guides',
            'This question mark opens the guide list again. Each tour only includes pages you are allowed to use.',
            'help-btn',
            '',
            '',
          ),
        ],
      },
      {
        id: 'your-account',
        title: 'Your account',
        subtitle: 'Change your name or password, and connect WhatsApp when the gym uses it',
        badge: 'Core',
        roles: ALL_TENANT_ROLES,
        keywords: ['account', 'profile', 'password', 'sign out', 'whatsapp'],
        steps: [
          step(
            'Profile menu',
            'Open your name in the top bar to edit your profile, change your password, or sign out.',
            'profile-menu',
            '',
            'header',
          ),
          {
            title: 'Connect WhatsApp',
            description: 'Link the phone that sends template messages. This page is available when WhatsApp is on the gym’s plan.',
            target: 'wa-connect-header',
            route: '/account/whatsapp',
            fallback: 'main',
            feature: 'whatsapp',
          },
          {
            title: 'Connection status',
            description: 'The status tells you whether this account is linked, waiting for a scan, or disconnected.',
            target: 'wa-connect-status',
            route: '/account/whatsapp',
            fallback: 'main',
            feature: 'whatsapp',
          },
          {
            title: 'Scan or connect',
            description: 'When a code is on screen, scan it from WhatsApp on your phone. Otherwise use Connect to start a link.',
            target: 'wa-connect-qr',
            route: '/account/whatsapp',
            fallback: '[data-walkthrough="wa-connect-action"]',
            feature: 'whatsapp',
          },
        ],
      },
      {
        id: 'notifications',
        title: 'Notifications',
        subtitle: 'See new requests and updates without leaving the page',
        badge: 'Core',
        roles: ['Sales', 'Sales Manager', 'Accountant'],
        keywords: ['notifications', 'bell', 'alerts'],
        steps: [
          step(
            'Notification bell',
            'The bell lists updates for your role, such as package requests and assignments. Open it, then jump to the item.',
            'notif-bell',
            '',
            'header',
          ),
        ],
      },
    ],
  },
  {
    title: 'Front desk',
    scenarios: [
      {
        id: 'check-in',
        title: 'Front desk check-in',
        subtitle: 'Scan a pass, look someone up, and watch today’s arrivals',
        badge: 'Front desk',
        roles: CHECKIN_ROLES,
        access: 'check_in',
        keywords: ['check in', 'check-in', 'scanner', 'barcode', 'attendance', 'front desk'],
        steps: [
          step(
            'Choose a mode',
            'Scanner uses the camera. Manual search is for typing an ID or using a USB scanner on the desk.',
            'checkin-modes',
            '/checkin',
          ),
          step(
            'Camera scanner',
            'Point the camera at the member’s QR. A successful scan checks them in and shows the result here.',
            'checkin-scanner',
            '/checkin?mode=scanner',
          ),
          step(
            'Type an ID',
            'Switch to manual search and type a system ID or member ID. A USB scanner can type into this box as well.',
            'checkin-search',
            '/checkin?mode=lookup',
          ),
          step(
            'Today’s arrivals',
            'Everyone who checked in today lands on this board, with the live count for the desk.',
            'checkin-board',
            '/checkin',
          ),
        ],
      },
      {
        id: 'member-directory',
        title: 'Member directory',
        subtitle: 'Find people, see who is active, and open a profile',
        badge: 'Front desk',
        roles: DIRECTORY_ROLES,
        access: 'members',
        keywords: ['members', 'directory', 'roster', 'profile', 'search'],
        steps: [
          step(
            'Search the directory',
            'Search by name, phone, or ID. Add Person is available when your role can create members.',
            'members-header',
            '/members',
          ),
          step(
            'Status and the list',
            'Totals split the gym into active, frozen, expired, and guest. Filter the list, then open a row for that member’s profile.',
            'members-board',
            '/members',
          ),
        ],
      },
      {
        id: 'contacts',
        title: 'Staff contacts',
        subtitle: 'Find a teammate and call them from the gym directory',
        badge: 'Front desk',
        roles: ALL_TENANT_ROLES,
        keywords: ['contacts', 'phone', 'staff', 'call'],
        steps: [
          step(
            'Find a teammate',
            'Search by name or number. Everyone signed in can open Contacts.',
            'contacts-header',
            '/contacts',
          ),
          step(
            'Staff and managers',
            'Filter the directory down to staff or managers, then use a card to reach that person.',
            'contacts-board',
            '/contacts',
          ),
        ],
      },
    ],
  },
  {
    title: 'Sales',
    scenarios: [
      {
        id: 'sales-dashboard',
        title: 'Sales dashboard',
        subtitle: 'Today’s revenue, membership counts, and shortcuts',
        badge: 'Sales',
        roles: SALES_ROLES,
        access: 'sales_dashboard',
        keywords: ['sales', 'dashboard', 'revenue', 'pipeline'],
        steps: [
          step(
            'Your sales home',
            'This is the sales starting point. The date in the header is the day these numbers belong to.',
            'sales-dash-header',
            '/sales/dashboard',
          ),
          step(
            'Numbers and shortcuts',
            'Revenue, active members, freezes, and guests sit in the cards. Managers also get pending requests and shortcuts into targets, packages, tasks, and staff.',
            'sales-dash-board',
            '/sales/dashboard',
          ),
        ],
      },
      {
        id: 'my-members',
        title: 'My members',
        subtitle: 'The people on your sales list, including guests you add',
        badge: 'Sales',
        roles: SALES_ROLES,
        access: 'sales_members',
        keywords: ['my members', 'guests', 'pipeline', 'sales members'],
        steps: [
          step(
            'Your list',
            'Search your members and add a guest when someone walks in without a membership yet.',
            'sales-members-header',
            '/sales/members',
          ),
          step(
            'Filters',
            'Narrow the list to people transferred to you, added in the last 30 days, or expiring this week. Status cards work the same way as the main directory.',
            'sales-members-board',
            '/sales/members',
          ),
          step(
            'Add a guest',
            'Someone without a membership yet is added as a guest from this button.',
            'add-guest-btn',
            '/sales/members',
          ),
          {
            title: 'Name and phone',
            description: 'The name and phone are required. Gender, birthdate, and source are optional. Saving puts them on your list.',
            target: 'add-guest-form',
            route: '/sales/members',
            reveal: 'add-guest',
            fallback: '[data-walkthrough="sales-members-board"]',
          },
        ],
      },
      {
        id: 'my-call-center',
        title: 'My call notes',
        subtitle: 'Log follow-ups on the members you own',
        badge: 'Sales',
        roles: ['Sales'],
        access: 'my_call_center',
        feature: 'sales_crm',
        keywords: ['call center', 'calls', 'notes', 'follow up', 'crm'],
        steps: [
          step(
            'Search your notes',
            'Find a call note by the member or by what you wrote.',
            'my-calls-header',
            '/sales/my-callcenter',
          ),
          step(
            'Follow-up list',
            'Filter by date to review who you still need to call. Notes you save here stay on that member.',
            'my-calls-board',
            '/sales/my-callcenter',
          ),
        ],
      },
      {
        id: 'manager-call-center',
        title: 'Team call center',
        subtitle: 'Review call notes across the sales team',
        badge: 'Sales',
        roles: SALES_LEAD_ROLES,
        access: 'manager_call_center',
        feature: 'sales_crm',
        keywords: ['call center', 'manager', 'notes', 'crm', 'follow up'],
        steps: [
          step(
            'Search the team’s notes',
            'Look across authors, members, and note text instead of only your own calls.',
            'manager-calls-header',
            '/sales/callcenter',
          ),
          step(
            'Who called whom',
            'Use the filters to see a rep’s follow-ups and spot members who have gone quiet.',
            'manager-calls-board',
            '/sales/callcenter',
          ),
        ],
      },
      {
        id: 'sales-requests',
        title: 'Package requests',
        subtitle: 'Ask for a package change, or approve one',
        badge: 'Sales',
        roles: SALES_ROLES,
        access: ['approve_requests', 'request_assignment', 'request_takeover'],
        keywords: ['requests', 'approval', 'assignment', 'takeover'],
        steps: [
          step(
            'Request queue',
            'Sales reps submit a request from here. Managers review the same queue and approve or reject it.',
            'requests-header',
            '/sales/requests',
          ),
          step(
            'Review the list',
            'Each row shows who asked, for which member, and whether it is still waiting. Managers can filter by rep.',
            'requests-board',
            '/sales/requests',
          ),
        ],
      },
      {
        id: 'packages',
        title: 'Membership packages',
        subtitle: 'Create the plans the gym sells',
        badge: 'Sales',
        roles: SALES_LEAD_ROLES,
        access: 'packages',
        feature: 'packages',
        keywords: ['packages', 'plans', 'pricing', 'membership'],
        steps: [
          step(
            'Package catalog',
            'New Package adds a plan with price, duration, freeze days, and invites.',
            'packages-header',
            '/sales/packages',
          ),
          step(
            'Plans on sale',
            'The table is what staff can assign to members. Edit a row to change price or duration.',
            'packages-board',
            '/sales/packages',
          ),
          step(
            'New package',
            'New Package opens a blank plan. Nothing is saved until you confirm.',
            'packages-new',
            '/sales/packages',
          ),
          {
            title: 'Price and limits',
            description: 'Set the name, price, and duration. Freeze days and invitation slots are the limits members can use later.',
            target: 'new-package-form',
            route: '/sales/packages',
            reveal: 'new-package',
            fallback: '[data-walkthrough="packages-board"]',
          },
        ],
      },
      {
        id: 'whatsapp-templates',
        title: 'WhatsApp templates',
        subtitle: 'Save messages staff can send from a member profile',
        badge: 'Sales',
        roles: WHATSAPP_ROLES,
        access: 'whatsapp_templates',
        feature: 'whatsapp',
        keywords: ['whatsapp', 'templates', 'messages', 'sms'],
        steps: [
          step(
            'Saved messages',
            'Create a template once. Staff then pick it on a member profile and WhatsApp opens with the text filled in.',
            'wa-header',
            whatsappTemplatesRoute,
          ),
          step(
            'Template list',
            'Each row is a message you can reuse for renewals, discounts, or coach follow-ups.',
            'wa-board',
            whatsappTemplatesRoute,
          ),
          step(
            'New template',
            'New template opens a blank message. Staff only see it after you save.',
            'wa-new',
            whatsappTemplatesRoute,
          ),
          {
            title: 'Template name',
            description: 'The title is what staff see when they pick a message. Name it for the moment, such as a welcome or a renewal.',
            target: 'template-name',
            route: whatsappTemplatesRoute,
            reveal: 'new-template',
            fallback: '[data-walkthrough="wa-board"]',
          },
          {
            title: 'Message and name token',
            description: 'Write the text, then use Add member’s name where their name should appear. That token becomes the real name when the message is sent.',
            target: 'template-body',
            route: whatsappTemplatesRoute,
            reveal: 'new-template',
            fallback: '[data-walkthrough="wa-board"]',
          },
        ],
      },
      {
        id: 'import-members',
        title: 'Import members',
        subtitle: 'Bring a spreadsheet of names and phones into the gym',
        badge: 'Sales',
        roles: SALES_LEAD_ROLES,
        access: 'import_members',
        feature: 'excel_import',
        keywords: ['import', 'excel', 'spreadsheet', 'upload', 'csv'],
        steps: [
          step(
            'Name and phone columns',
            'The sheet needs a name column and a phone column. Other headings are ignored. Duplicate phones are skipped.',
            'import-columns',
            '/sales/import',
          ),
          step(
            'Choose the file',
            'Drop an Excel or CSV file here. Forma splits a large sheet and imports it in the background. This guide does not upload a file.',
            'import-drop',
            '/sales/import',
          ),
          {
            title: 'Who was added',
            description: 'After an import finishes, this report lists the people that were created.',
            target: 'imported-header',
            route: '/reports/imported',
            fallback: 'main',
            roles: IMPORTED_ROLES,
            access: 'reports',
          },
        ],
      },
    ],
  },
  {
    title: 'Coaching',
    scenarios: [
      {
        id: 'coach-dashboard',
        title: 'Coach dashboard',
        subtitle: 'Sessions left and the people training with you',
        badge: 'Coaching',
        roles: COACH_ROLES,
        access: 'coach_dashboard',
        keywords: ['coach', 'dashboard', 'sessions', 'pt'],
        steps: [
          step(
            'Coaching home',
            'Start here for the people assigned to you and how many sessions are still unused.',
            'coach-dash-header',
            '/coach/dashboard',
          ),
          step(
            'Roster and shortcuts',
            'Open a member from the list, or jump to session check-in and your trainee list.',
            'coach-dash-board',
            '/coach/dashboard',
          ),
        ],
      },
      {
        id: 'coach-members',
        title: 'Trainees',
        subtitle: 'Everyone on the coaching roster and their session status',
        badge: 'Coaching',
        roles: COACH_ROLES,
        access: 'coach_members',
        keywords: ['trainees', 'coach members', 'pt', 'sessions'],
        steps: [
          step(
            'Find a trainee',
            'Search by name, phone, or ID. Coaches see their own people. Head Coaches see the wider roster.',
            'coach-members-header',
            '/coach/members',
          ),
          step(
            'Session status',
            'Active, interested, transferred, and expired counts tell you who still has coaching to deliver.',
            'coach-members-board',
            '/coach/members',
          ),
        ],
      },
      {
        id: 'coach-checkin',
        title: 'Session check-in',
        subtitle: 'Mark a personal training session as used',
        badge: 'Coaching',
        roles: COACH_ROLES,
        access: 'coach_checkin',
        keywords: ['session', 'check-in', 'pt', 'deduct'],
        steps: [
          step(
            'Session check-in',
            'This is separate from the front-desk door check-in. It records a coaching session against the member’s package.',
            'coach-checkin-header',
            '/coach/checkin',
          ),
          step(
            'Look up the member',
            'Search by system ID, member ID, or phone. You can check in only when the coaching package is active and sessions remain.',
            'coach-checkin-board',
            '/coach/checkin',
          ),
        ],
      },
      {
        id: 'coach-transfers',
        title: 'Coach transfers',
        subtitle: 'See who was moved onto a coach today',
        badge: 'Coaching',
        roles: COACH_ROLES,
        access: 'my_transfers',
        keywords: ['transfers', 'assigned', 'coach'],
        steps: [
          step(
            'Today’s transfers',
            'When a member is handed to a coach, they show up here for the day of the transfer.',
            'transfers-header',
            '/coach/my-transfers',
          ),
          step(
            'Who arrived',
            'Coaches see people transferred to them. Head Coaches see every coach transfer from today.',
            'transfers-board',
            '/coach/my-transfers',
          ),
        ],
      },
      {
        id: 'coach-team',
        title: 'Coach team',
        subtitle: 'See each coach’s members and remaining sessions',
        badge: 'Coaching',
        roles: ['Head Coach'],
        access: 'coach_team',
        keywords: ['coach team', 'coaches', 'roster'],
        steps: [
          step(
            'Coaching team',
            'This page is the Head Coach’s view of the coaching staff.',
            'coach-team-header',
            '/coach/team',
          ),
          step(
            'Load by coach',
            'Totals show how many members and sessions sit with the team. Open a coach to see their people.',
            'coach-team-board',
            '/coach/team',
          ),
        ],
      },
      {
        id: 'create-coach',
        title: 'Create a coach account',
        subtitle: 'Add a coach who can sign in and take sessions',
        badge: 'Coaching',
        roles: ['Head Coach'],
        access: 'coach_staff',
        keywords: ['create coach', 'staff', 'account'],
        steps: [
          step(
            'New coach',
            'A coach needs an account before members can be assigned to them.',
            'coach-staff-header',
            '/coach/staff',
          ),
          step(
            'Name and email',
            'Enter the coach’s name and email. They set their own password from the invite.',
            'coach-staff-board',
            '/coach/staff',
          ),
        ],
      },
    ],
  },
  {
    title: 'Tasks',
    scenarios: [
      {
        id: 'assign-tasks',
        title: 'Assign tasks',
        subtitle: 'Hand members to sales or coaches and track what is still open',
        badge: 'Tasks',
        roles: ASSIGN_ROLES,
        access: ['transfer', 'coach_transfer', 'members'],
        keywords: ['tasks', 'assign', 'transfer', 'bulk'],
        steps: [
          step(
            'Task tools',
            'Filter members for a bulk handoff, review tasks you already created, and export the sheet.',
            'assign-tasks-header',
            '/tasks',
          ),
          step(
            'Open work',
            'The counts show tasks created, still pending, and how many members have been assigned. The schedule below is where you give the work out.',
            'assign-tasks-board',
            '/tasks',
          ),
          step(
            'Select members',
            'Tick the people who should move. Select all filtered grabs everyone currently in the list.',
            'assign-select',
            '/tasks',
            '[data-walkthrough="assign-tasks-board"]',
          ),
          step(
            'Assign sales or a coach',
            'Assign Sales Rep or Assign Coach opens the destination. Confirming notifies that person and puts the members on their task list.',
            'assign-actions',
            '/tasks',
            '[data-walkthrough="assign-select"]',
          ),
        ],
      },
      {
        id: 'my-tasks',
        title: 'My tasks',
        subtitle: 'Work the members that were assigned to you',
        badge: 'Tasks',
        roles: ASSIGNED_ROLES,
        access: ['sales_members', 'coach_members', 'my_transfers', 'members'],
        keywords: ['my tasks', 'assigned', 'follow up'],
        steps: [
          step(
            'Work assigned to you',
            'This list is members someone handed you. Refresh if you are waiting on a new assignment.',
            'my-tasks-header',
            '/tasks/assigned',
          ),
          step(
            'Pending queue',
            'Active tasks still need a follow-up. Open a name to see that member, then come back to mark the work done.',
            'my-tasks-active',
            '/tasks/assigned',
            '[data-walkthrough="my-tasks-board"]',
          ),
          step(
            'Mark done',
            'Mark Done clears that member from the pending queue. History keeps what you already finished.',
            'my-tasks-complete',
            '/tasks/assigned',
            '[data-walkthrough="my-tasks-active"]',
          ),
        ],
      },
    ],
  },
  {
    title: 'Accounting',
    scenarios: [
      {
        id: 'accounting-dashboard',
        title: 'Accounting dashboard',
        subtitle: 'Pending approvals, today’s revenue, and the latest contracts',
        badge: 'Accounting',
        roles: ACCOUNTING_ROLES,
        access: 'accounting_dashboard',
        feature: 'accounting',
        keywords: ['accounting', 'revenue', 'dashboard', 'ledger'],
        steps: [
          step(
            'Finance home',
            'Accountants land here. Owners and general managers can open the same view when accounting is on the plan.',
            'acct-dash-header',
            '/accounting/dashboard',
          ),
          step(
            'What needs a decision',
            'Pending package requests, today’s takings, and this month’s contracts are the cards. Open one to go to that queue.',
            'acct-dash-board',
            '/accounting/dashboard',
          ),
        ],
      },
      {
        id: 'contracts',
        title: 'Contract history',
        subtitle: 'Every membership contract the gym has recorded',
        badge: 'Accounting',
        roles: CONTRACT_ROLES,
        access: 'contracts',
        feature: 'accounting',
        keywords: ['contracts', 'history', 'invoices', 'payments'],
        steps: [
          step(
            'Contract ledger',
            'This is the record of packages that were sold, including who processed them.',
            'contracts-header',
            '/accounting/contract-history',
          ),
          step(
            'Filter by date',
            'Set a from and to date to audit a period, then open a row for that member’s contract.',
            'contracts-board',
            '/accounting/contract-history',
          ),
        ],
      },
      {
        id: 'package-requests',
        title: 'Exception requests',
        subtitle: 'Approve discounts, freezes, and other package exceptions',
        badge: 'Accounting',
        roles: ACCOUNTING_ROLES,
        access: 'package_approvals',
        feature: 'exception_approvals',
        keywords: ['exceptions', 'discounts', 'freeze', 'approvals', 'package requests'],
        steps: [
          step(
            'Exception queue',
            'Staff send non-standard prices and freezes here instead of applying them on their own.',
            'pkg-requests-header',
            '/accounting/package-requests',
          ),
          step(
            'Pending list',
            'Pending rows are waiting for a yes or no. Approved and rejected history stays underneath so you can look back.',
            'pkg-requests-pending',
            '/accounting/package-requests',
            '[data-walkthrough="pkg-requests-board"]',
          ),
          {
            title: 'Approve or reject',
            description: 'Approve accepts the price and terms. Reject sends it back. When nothing is waiting, those buttons appear on the next request.',
            target: 'pkg-request-actions',
            route: '/accounting/package-requests',
            reveal: 'package-request',
            fallback: '[data-walkthrough="pkg-requests-pending"]',
          },
        ],
      },
      {
        id: 'targets',
        title: 'Revenue targets',
        subtitle: 'Compare what the gym collected with the target for the period',
        badge: 'Accounting',
        roles: TARGET_ROLES,
        access: 'targets',
        feature: 'accounting',
        keywords: ['targets', 'revenue', 'monthly', 'annual'],
        steps: [
          step(
            'Targets',
            'Use this when you want collected revenue against the goal, not a single contract.',
            'targets-header',
            '/sales/targets',
          ),
          step(
            'Today, month, year',
            'Switch the period to see today, the month, the year, or the subscriptions behind the numbers.',
            'targets-board',
            '/sales/targets',
          ),
        ],
      },
    ],
  },
  {
    title: 'Reports',
    scenarios: [
      {
        id: 'reports',
        title: 'Reports',
        subtitle: 'Guest lists, expired members, and the deeper gym reports on your plan',
        badge: 'Reports',
        roles: REPORT_ROLES,
        access: ['reports', 'accounting_dashboard'],
        feature: REPORT_FEATURES,
        keywords: ['reports', 'guests', 'expired', 'churn', 'forecast'],
        steps: [
          step(
            'Report library',
            'Each card opens one report. Cards you do not see are either off for your role or not on this gym’s plan.',
            'reports-header',
            '/reports',
          ),
          step(
            'Pick a report',
            'Member reports cover guests and expired memberships. Platinum plans add executive, churn, forecast, cohort, attendance, and funnel reports.',
            'reports-board',
            '/reports',
          ),
        ],
      },
      {
        id: 'analytics',
        title: 'Analytics',
        subtitle: 'Trends for joins, attendance, and revenue',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        access: ['reports', 'owner_dashboard', 'accounting_dashboard', 'sales_dashboard'],
        feature: 'members',
        keywords: ['analytics', 'charts', 'trends', 'snapshots'],
        steps: [
          step(
            'Analytics home',
            'Charts here come from gym snapshots. The time in the header is when the numbers were last updated.',
            'analytics-header',
            '/analytics',
          ),
          step(
            'Choose a series',
            'Switch the chart to the trend you care about, such as new joins or check-ins. An empty state means the first snapshot has not landed yet.',
            'analytics-board',
            '/analytics',
          ),
        ],
      },
    ],
  },
  {
    title: 'Admin',
    scenarios: [
      {
        id: 'management',
        title: 'Management',
        subtitle: 'The shortcut board for tools your role is allowed to run',
        badge: 'Admin',
        roles: MANAGEMENT_ROLES,
        access: 'management',
        keywords: ['management', 'shortcuts', 'staff', 'settings'],
        steps: [
          step(
            'Management board',
            'This page groups the tools for running the gym: requests, packages, teams, staff accounts, and access.',
            'management-header',
            '/management',
          ),
          step(
            'Only your tools',
            'A card appears only when you have that access. Sales managers, Head Coaches, and owners therefore do not all see the same board.',
            'management-board',
            '/management',
          ),
        ],
      },
      {
        id: 'owner-dashboard',
        title: 'Gym overview',
        subtitle: 'Members, revenue, check-ins, and queues in one place',
        badge: 'Admin',
        roles: OWNER_ROLES,
        access: 'owner_dashboard',
        keywords: ['owner', 'overview', 'dashboard', 'general manager'],
        steps: [
          step(
            'Gym overview',
            'Owners and general managers start here for a whole-gym picture rather than one team’s pipeline.',
            'owner-dash-header',
            '/owner/dashboard',
          ),
          step(
            'Queues that need you',
            'Member totals, revenue, pending package exceptions, sales requests, and today’s check-ins. A card opens that area when you are allowed in.',
            'owner-dash-board',
            '/owner/dashboard',
          ),
        ],
      },
      {
        id: 'teams',
        title: 'All teams',
        subtitle: 'Sales, coaches, accountants, and reception on one roster',
        badge: 'Admin',
        roles: OWNER_ROLES,
        access: 'teams_overview',
        keywords: ['teams', 'staff', 'roster'],
        steps: [
          step(
            'Everyone who works here',
            'Switch between sales, coaches, accountants, and reception without opening each team page.',
            'teams-header',
            '/owner/teams',
          ),
          step(
            'Headcount',
            'The strip across the top is the size of each team. Open a person to see their profile.',
            'teams-board',
            '/owner/teams',
          ),
        ],
      },
      {
        id: 'access-control',
        title: 'Access',
        subtitle: 'Choose which areas each role can open',
        badge: 'Admin',
        roles: ACCESS_ROLES,
        access: 'access_control',
        keywords: ['access', 'roles', 'permissions', 'checklist'],
        steps: [
          step(
            'Who can do what',
            'Access does not change someone’s job title. It turns areas on or off: members, check-in, sales, coaching, accounting, and the rest.',
            'access-header',
            (user) => accessRoute(user, 'staff'),
          ),
          step(
            'One person’s switches',
            'Pick a person, then turn areas on or off for that account. You can only hand out areas you still have yourself.',
            'access-staff',
            (user) => accessRoute(user, 'staff'),
            '[data-walkthrough="access-board"]',
          ),
          {
            title: 'Role defaults',
            description: 'Role defaults set the starting checklist for everyone in that job. The owner’s own settings stay with the owner.',
            target: 'access-roles',
            route: (user) => accessRoute(user, 'roles'),
            fallback: '[data-walkthrough="access-board"]',
            roles: ROLE_DEFAULT_ROLES,
          },
        ],
      },
      {
        id: 'gym-settings',
        title: 'Gym settings',
        subtitle: 'Brand, locale, and the plan for this gym',
        badge: 'Admin',
        roles: ['Owner'],
        access: 'settings',
        keywords: ['settings', 'branding', 'logo', 'locale', 'plan'],
        steps: [
          step(
            'Gym settings',
            'Only the owner can change the gym’s name, logo, colors, and locale.',
            'settings-header',
            '/owner/settings?tab=branding',
          ),
          step(
            'Brand',
            'The name, logo, and colors here are what staff see in the bar and on buttons.',
            'settings-brand',
            '/owner/settings?tab=branding',
          ),
          step(
            'Locale',
            'Currency, timezone, and the activities this gym offers are set on this tab.',
            'settings-locale',
            '/owner/settings?tab=locale',
          ),
          {
            title: 'WhatsApp for the gym',
            description: 'This tab shows whether the gym number is connected and how many messages the plan has used.',
            target: 'settings-whatsapp',
            route: '/owner/settings?tab=whatsapp',
            fallback: 'main',
            feature: 'whatsapp',
          },
          step(
            'Plan',
            'The plan tab is the package this gym is on and the usage against its limits.',
            'settings-plan',
            '/owner/settings?tab=plan',
          ),
        ],
      },
    ],
  },
  {
    title: 'Member profile',
    scenarios: [
      {
        id: 'member-profile',
        title: 'Member profile',
        subtitle: 'The person page: actions in the header and the tabs underneath',
        badge: 'Members',
        roles: PROFILE_ROLES,
        access: 'member_profile',
        keywords: ['profile', 'member', 'qr', 'tabs'],
        steps: [
          memberStep(
            'Profile actions',
            'From a member’s page you can send their QR code when they have a membership. Front desk and managers can also check them in from here. Sales managers can block or unblock.',
            'member-actions',
            'dashboard',
          ),
          memberStep(
            'Profile tabs',
            'Dashboard, personal info, packages, files, alerts, call notes, freeze, invitations, check-ins, and the activity log. You only see actions your role is allowed to take.',
            'member-tabs',
            'dashboard',
          ),
        ],
      },
      {
        id: 'member-personal',
        title: 'Personal info',
        subtitle: 'Name, phone, and who the member is assigned to',
        badge: 'Members',
        roles: PROFILE_ROLES,
        access: 'member_profile',
        keywords: ['personal', 'phone', 'edit member', 'assign'],
        steps: [
          memberStep(
            'Personal tab',
            'Personal info holds the member’s contact details and assignment.',
            'member-tabs',
            'personal',
          ),
          memberStep(
            'Edit the record',
            'Owners, managers, and reception can update details. Sales managers and the owner can assign a sales rep. Phone numbers stay hidden when your account is not allowed to see them.',
            'member-panel',
            'personal',
          ),
        ],
      },
      {
        id: 'member-packages',
        title: 'Member packages',
        subtitle: 'See the membership on file and, if you can, add or refund one',
        badge: 'Members',
        roles: PROFILE_ROLES,
        access: 'member_profile',
        feature: 'packages',
        keywords: ['package', 'subscription', 'renew', 'refund'],
        steps: [
          memberStep(
            'Packages tab',
            'Open Packages on the member to see the current membership and personal training sessions.',
            'member-tabs',
            'packages',
          ),
          memberStep(
            'Add or refund',
            'Owners and accountants can add a package or issue a refund. Sales managers request a change instead of applying a special price themselves.',
            'member-panel',
            'packages',
          ),
          {
            ...memberStep(
              'Add or request',
              'Add Package assigns it now. Request Package sends the terms to accounting first.',
              'add-package-btn',
              'packages',
            ),
            roles: PACKAGE_ACTOR_ROLES,
          },
          {
            ...memberStep(
              'Duration, price, exception',
              'Pick a base plan, then set the duration and the price paid. A sales manager turns on Make Exception when the terms are not the catalog price, and the accountant has to approve it.',
              'add-package-form',
              'packages',
            ),
            roles: PACKAGE_ACTOR_ROLES,
            reveal: 'add-package',
          },
        ],
      },
      {
        id: 'member-freeze',
        title: 'Freeze a membership',
        subtitle: 'Pause a package and see when it resumes',
        badge: 'Members',
        roles: FREEZE_ROLES,
        access: 'member_profile',
        keywords: ['freeze', 'pause', 'hold'],
        steps: [
          memberStep(
            'Freeze tab',
            'Freeze is where a membership is put on hold.',
            'member-tabs',
            'freeze',
          ),
          memberStep(
            'Hold and resume',
            'Reception, sales, and the owner can freeze a package that still has freeze days. The dates show when the hold ends.',
            'member-panel',
            'freeze',
          ),
        ],
      },
      {
        id: 'member-call-notes',
        title: 'Call notes',
        subtitle: 'Write what was said on a sales follow-up',
        badge: 'Members',
        roles: SALES_NOTE_ROLES,
        access: 'member_profile',
        feature: 'sales_crm',
        keywords: ['notes', 'call', 'follow up', 'crm'],
        steps: [
          memberStep(
            'Call center tab',
            'Notes on the member stay with that person, separate from the call-center list.',
            'member-tabs',
            'callcenter',
          ),
          memberStep(
            'Save a note',
            'Sales and the owner add a note after a call. The history shows who wrote it and when.',
            'member-panel',
            'callcenter',
          ),
        ],
      },
      {
        id: 'member-coach-notes',
        title: 'Coach notes',
        subtitle: 'Record coaching notes on a trainee',
        badge: 'Members',
        roles: COACH_ROLES,
        access: 'member_profile',
        keywords: ['coach notes', 'session notes', 'trainee'],
        steps: [
          memberStep(
            'Notes tab',
            'Coaches use the call center tab for coaching notes, not sales call logs.',
            'member-tabs',
            'callcenter',
          ),
          memberStep(
            'Write a coaching note',
            'Add what happened in the session. Other coaches and the Head Coach can read it on this member.',
            'member-panel',
            'callcenter',
          ),
        ],
      },
      {
        id: 'member-invitations',
        title: 'Invitations',
        subtitle: 'Guest passes this member can hand out',
        badge: 'Members',
        roles: INVITE_ROLES,
        access: 'member_profile',
        keywords: ['invitations', 'guest pass', 'invite'],
        steps: [
          memberStep(
            'Invitations tab',
            'Invitations are the guest passes attached to this membership.',
            'member-tabs',
            'invitations',
          ),
          memberStep(
            'Add a guest',
            'Sales, reception, and the owner can add an invitation when the package still has invites left.',
            'member-panel',
            'invitations',
          ),
        ],
      },
      {
        id: 'member-alerts',
        title: 'Member alerts',
        subtitle: 'Leave a warning that shows when this person is opened',
        badge: 'Members',
        roles: ALERT_ROLES,
        access: 'member_profile',
        keywords: ['alerts', 'warning', 'flag'],
        steps: [
          memberStep(
            'Alerts tab',
            'An active alert pops up the next time someone opens this member.',
            'member-tabs',
            'alerts',
          ),
          memberStep(
            'Add or clear an alert',
            'Reception and sales can write an alert, for example an unpaid balance or a medical note, and turn it off when it no longer applies.',
            'member-panel',
            'alerts',
          ),
        ],
      },
      {
        id: 'member-files',
        title: 'Member files',
        subtitle: 'Documents saved on the member',
        badge: 'Members',
        roles: PROFILE_ROLES,
        access: 'member_profile',
        keywords: ['files', 'documents', 'upload', 'id'],
        steps: [
          memberStep(
            'Files tab',
            'Files keeps IDs and other documents uploaded for this person.',
            'member-tabs',
            'files',
          ),
          memberStep(
            'What is on file',
            'Open a file to review it. Accountants see the documents they need when checking a contract.',
            'member-panel',
            'files',
          ),
        ],
      },
      {
        id: 'member-checkins',
        title: 'Check-in history',
        subtitle: 'Door check-ins and coaching sessions for this member',
        badge: 'Members',
        roles: PROFILE_ROLES,
        access: 'member_profile',
        keywords: ['check-in history', 'attendance', 'visits'],
        steps: [
          memberStep(
            'History tab',
            'Check-in history is the visit log for this member.',
            'member-tabs',
            'checkins',
          ),
          memberStep(
            'Visits and sessions',
            'Front-desk check-ins and personal training sessions are listed with their times.',
            'member-panel',
            'checkins',
          ),
        ],
      },
      {
        id: 'member-activity',
        title: 'Activity log',
        subtitle: 'Who opened this profile and other background events',
        badge: 'Members',
        roles: PROFILE_ROLES,
        access: 'member_profile',
        keywords: ['activity', 'audit', 'profile views', 'others'],
        steps: [
          memberStep(
            'Others tab',
            'The last tab is the activity around this profile.',
            'member-tabs',
            'others',
          ),
          memberStep(
            'Who looked',
            'Profile views show which staff opened this member. Coaches see the coaching side of that log.',
            'member-panel',
            'others',
          ),
        ],
      },
    ],
  },
  {
    title: 'Team tools',
    scenarios: [
      {
        id: 'sales-team',
        title: 'Sales team',
        subtitle: 'Sales reps and reception, with their numbers',
        badge: 'Team',
        roles: TEAM_ROLES,
        access: 'sales_team',
        keywords: ['sales team', 'reception', 'reps'],
        steps: [
          step(
            'Team page',
            'Switch between sales and reception to see who is on each desk.',
            'sales-team-header',
            '/sales/team',
          ),
          step(
            'Open a person',
            'Each card shows that person’s members and results. Open one for their full profile.',
            'sales-team-board',
            '/sales/team',
          ),
        ],
      },
      {
        id: 'create-staff',
        title: 'Create a staff account',
        subtitle: 'Invite someone who can sign in',
        badge: 'Team',
        roles: STAFF_ROLES,
        access: 'staff',
        keywords: ['staff', 'invite', 'create account', 'user'],
        steps: [
          step(
            'New staff account',
            'Create the login for a new teammate. They set their own password from the invite.',
            'staff-header',
            '/sales/staff',
          ),
          step(
            'Role you can assign',
            'The role list only includes jobs you are allowed to create. A sales manager cannot create an owner.',
            'staff-board',
            '/sales/staff',
          ),
        ],
      },
      {
        id: 'quick-transfer',
        title: 'Quick transfer',
        subtitle: 'Move one member to another sales rep or coach by system ID',
        badge: 'Team',
        roles: ALL_TENANT_ROLES,
        access: ['transfer', 'coach_transfer'],
        keywords: ['quick transfer', 'reassign', 'system id'],
        steps: [
          step(
            'Transfer one member',
            'Use a system ID when you already know who to move and do not want the full task sheet.',
            'quick-transfer-header',
            '/management/quick-transfer',
          ),
          step(
            'Pick the destination',
            'Choose a sales rep or a coach, add a reason, and confirm. The member’s assignment updates immediately.',
            'quick-transfer-board',
            '/management/quick-transfer',
          ),
        ],
      },
      {
        id: 'task-filter',
        title: 'Filter members for tasks',
        subtitle: 'Narrow the list before a bulk handoff',
        badge: 'Tasks',
        roles: ASSIGN_ROLES,
        access: ['transfer', 'coach_transfer', 'members'],
        keywords: ['filter', 'bulk', 'tasks', 'search members'],
        steps: [
          step(
            'Filter page',
            'This is the search behind Filter & Bulk Actions on the task sheet.',
            'task-filter-header',
            '/tasks/filter',
          ),
          step(
            'Choose who qualifies',
            'Filter by status, package, dates, or the rep or coach they sit with, then continue to the matching members.',
            'task-filter-board',
            '/tasks/filter',
          ),
          {
            title: 'Matching members',
            description: 'The results open with everyone included until you narrow the form. Tick the rows you want to hand off.',
            target: 'filter-results-select',
            route: '/tasks/filter/results',
            routeState: FILTER_RESULTS_STATE,
            fallback: 'main',
          },
          {
            title: 'Hand them off',
            description: 'Assign Sales Rep or Assign Coach sends the selected people and notifies the person who receives them.',
            target: 'filter-results-actions',
            route: '/tasks/filter/results',
            routeState: FILTER_RESULTS_STATE,
            fallback: '[data-walkthrough="filter-results-select"]',
          },
          {
            title: 'Message the selection',
            description: 'WhatsApp sends a template to the members you ticked, when that feature is on the plan.',
            target: 'filter-results-wa',
            route: '/tasks/filter/results',
            routeState: FILTER_RESULTS_STATE,
            fallback: '[data-walkthrough="filter-results-actions"]',
            feature: 'whatsapp',
          },
        ],
      },
      {
        id: 'my-subscriptions',
        title: 'My subscriptions',
        subtitle: 'Contracts you sold, new and renewed',
        badge: 'Sales',
        roles: ['Sales'],
        access: 'sales_dashboard',
        keywords: ['subscriptions', 'sold', 'renewals', 'my sales'],
        steps: [
          step(
            'What you sold',
            'My subscriptions is your own contract list, not the whole gym’s ledger.',
            'subs-header',
            '/sales/subscriptions',
          ),
          step(
            'New versus renewal',
            'Pick a date range. The list splits first-time contracts from renewals.',
            'subs-board',
            '/sales/subscriptions',
          ),
        ],
      },
    ],
  },
  {
    title: 'Report details',
    scenarios: [
      {
        id: 'report-guests',
        title: 'Guest members',
        subtitle: 'People who have not taken a membership yet',
        badge: 'Reports',
        roles: GUEST_REPORT_ROLES,
        access: 'reports',
        keywords: ['guests', 'leads', 'guest report'],
        steps: [
          step('Guest report', 'This list is everyone still marked as a guest.', 'guests-header', '/reports/guests'),
          step('Narrow the list', 'Filter by rep, coach, source, or dates, then open a person from the results.', 'guests-board', '/reports/guests'),
        ],
      },
      {
        id: 'report-members',
        title: 'Member records',
        subtitle: 'Search memberships by status, package, and dates',
        badge: 'Reports',
        roles: GUEST_REPORT_ROLES,
        access: 'reports',
        keywords: ['expired', 'member report', 'records'],
        steps: [
          step('Member report', 'Use this when you need a filtered export of members, including expired ones.', 'records-header', '/reports/expired'),
          step('Filters', 'Status, package, gender, and dates change who is in the table.', 'records-board', '/reports/expired'),
        ],
      },
      {
        id: 'report-imported',
        title: 'Imported members',
        subtitle: 'People added from a spreadsheet',
        badge: 'Reports',
        roles: IMPORTED_ROLES,
        access: 'reports',
        keywords: ['imported', 'excel', 'spreadsheet'],
        steps: [
          step('Import results', 'After a spreadsheet import, this report shows who was added.', 'imported-header', '/reports/imported'),
          step('Find a row', 'Search by name or phone and filter by rep, status, or date.', 'imported-board', '/reports/imported'),
        ],
      },
      {
        id: 'report-executive',
        title: 'Executive summary',
        subtitle: 'Active members, churn, forecast, and conversion on one page',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        feature: 'business_intelligence',
        keywords: ['executive', 'summary', 'kpi'],
        steps: [
          step('Executive summary', 'One page for the gym’s headline numbers.', 'report-header', '/reports/executive'),
          step('Read the figures', 'The definition under the title explains what each number includes.', 'report-body', '/reports/executive'),
        ],
      },
      {
        id: 'report-churn',
        title: 'Churn',
        subtitle: 'Lapses, reactivations, and memberships about to end',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        feature: 'exec_analytics',
        keywords: ['churn', 'lapse', 'reactivation'],
        steps: [
          step('Churn report', 'Churn shows who left and who came back.', 'report-header', '/reports/churn'),
          step('The window', 'The date window on the page is the period those lapses belong to.', 'report-body', '/reports/churn'),
        ],
      },
      {
        id: 'report-forecast',
        title: 'Revenue forecast',
        subtitle: 'Collected revenue and a short average looking ahead',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        feature: 'exec_analytics',
        keywords: ['forecast', 'revenue'],
        steps: [
          step('Forecast', 'The forecast is based on revenue already collected.', 'report-header', '/reports/forecast'),
          step('The average', 'Use it as a planning figure, not as a bill that has already been paid.', 'report-body', '/reports/forecast'),
        ],
      },
      {
        id: 'report-cohorts',
        title: 'Retention cohorts',
        subtitle: 'How many people from each joining month are still covered',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        feature: 'exec_analytics',
        keywords: ['cohorts', 'retention'],
        steps: [
          step('Cohorts', 'Each row is a month people joined.', 'report-header', '/reports/cohorts'),
          step('Still covered', 'The cells show what share of that month still has a membership.', 'report-body', '/reports/cohorts'),
        ],
      },
      {
        id: 'report-attendance',
        title: 'Attendance',
        subtitle: 'Check-ins by weekday and hour',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        feature: 'exec_analytics',
        keywords: ['attendance', 'busy hours', 'check-ins'],
        steps: [
          step('Attendance report', 'This is when the gym is busy, not a single member’s visits.', 'report-header', '/reports/attendance'),
          step('Weekday and hour', 'Use the heatmap to see which hours need more floor staff.', 'report-body', '/reports/attendance'),
        ],
      },
      {
        id: 'report-funnel',
        title: 'Conversion funnel',
        subtitle: 'From lead to member, including where people drop off',
        badge: 'Reports',
        roles: ANALYTICS_ROLES,
        feature: 'funnels',
        keywords: ['funnel', 'conversion', 'leads'],
        steps: [
          step('Funnel', 'The funnel follows people from first contact to a paid membership.', 'report-header', '/reports/funnel'),
          step('Drop-off', 'Each stage shows how many continued and how much revenue that source produced.', 'report-body', '/reports/funnel'),
        ],
      },
    ],
  },
  {
    title: 'Staff profiles',
    scenarios: [
      {
        id: 'sales-rep-profile',
        title: 'Sales rep profile',
        subtitle: 'One rep’s members, target, and what they are allowed to do',
        badge: 'Team',
        roles: SALES_PROFILE_ROLES,
        access: 'sales_team',
        keywords: ['sales rep', 'rep profile', 'abilities', 'target'],
        steps: [
          subjectStep(
            'This rep',
            'The header is the person, their role, and the password reset a manager can send.',
            'sales-profile-header',
            'sales',
          ),
          subjectStep(
            'Their members',
            'Members lists everyone currently assigned to this rep. Open a row to go to that person.',
            'sales-profile-members',
            'sales',
            'members',
          ),
          subjectStep(
            'What they can do',
            'The switches control notes, assignment requests, takeovers, and WhatsApp templates for this account.',
            'sales-profile-abilities',
            'sales',
            'access',
          ),
        ],
      },
      {
        id: 'receptionist-profile',
        title: 'Receptionist profile',
        subtitle: 'The desk account: phone, role, and whether they can see member numbers',
        badge: 'Team',
        roles: RECEPTION_PROFILE_ROLES,
        access: 'sales_team',
        keywords: ['receptionist', 'front desk', 'phone privacy'],
        steps: [
          subjectStep(
            'This receptionist',
            'The header is the desk account and, for a manager, the role change.',
            'receptionist-profile-header',
            'receptionist',
          ),
          subjectStep(
            'Their phone',
            'The mobile number is how the gym reaches this person. A manager can update it here.',
            'receptionist-mobile',
            'receptionist',
          ),
          subjectStep(
            'Member phone numbers',
            'Phone number access decides whether this account can see member phones on a profile.',
            'receptionist-privacy',
            'receptionist',
          ),
        ],
      },
      {
        id: 'coach-profile',
        title: 'Coach profile',
        subtitle: 'One coach’s trainees and the switches on that account',
        badge: 'Coaching',
        roles: ['Head Coach'],
        access: 'coach_team',
        keywords: ['coach profile', 'trainees', 'abilities'],
        steps: [
          subjectStep(
            'This coach',
            'The header is the coach and how many people train with them.',
            'coach-profile-header',
            'coach',
          ),
          subjectStep(
            'Their trainees',
            'Members are the people assigned to this coach, with a status filter for who is still active.',
            'coach-profile-members',
            'coach',
            'members',
          ),
          subjectStep(
            'What they can do',
            'The switches control coaching notes and whether this coach can request an assignment or a takeover.',
            'coach-profile-abilities',
            'coach',
            'access',
          ),
        ],
      },
      {
        id: 'roster-profile',
        title: 'Roster profile',
        subtitle: 'One person from the gym roster, their people, and their areas',
        badge: 'Admin',
        roles: OWNER_ROLES,
        access: 'teams_overview',
        keywords: ['roster', 'staff profile', 'areas', 'access'],
        steps: [
          subjectStep(
            'This person',
            'The header is whoever you opened from All teams: sales, coach, accountant, or reception.',
            'roster-profile-header',
            'staff',
          ),
          subjectStep(
            'People on their account',
            'Sales and coaches show the members assigned to them. Other roles skip this list.',
            'roster-members',
            'staff',
          ),
          subjectStep(
            'Areas they can open',
            'The area switches turn parts of the gym on or off for this one account.',
            'roster-access',
            'staff',
          ),
        ],
      },
    ],
  },
];

export function memberIdFromLocation(location) {
  const match = String(location?.pathname || '').match(/^\/members\/([^/]+)$/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function applyMemberRoutes(steps, memberId) {
  if (!memberId || !steps?.some((item) => item.memberTab)) return steps || [];
  const id = encodeURIComponent(memberId);
  return steps.map((item) => (
    item.memberTab
      ? { ...item, route: `/members/${id}?tab=${item.memberTab}` }
      : item
  ));
}

const SUBJECT_PATTERNS = {
  sales: /^\/sales\/team\/(?!receptionist\/)([^/]+)$/,
  receptionist: /^\/sales\/team\/receptionist\/([^/]+)$/,
  coach: /^\/coach\/team\/([^/]+)$/,
  staff: /^\/owner\/teams\/([^/]+)$/,
};

const SUBJECT_PATHS = {
  sales: (id) => `/sales/team/${id}`,
  receptionist: (id) => `/sales/team/receptionist/${id}`,
  coach: (id) => `/coach/team/${id}`,
  staff: (id) => `/owner/teams/${id}`,
};

export function subjectIdFromLocation(location, subject) {
  const pattern = SUBJECT_PATTERNS[subject];
  if (!pattern) return '';
  const match = String(location?.pathname || '').match(pattern);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function applySubjectRoutes(steps, ids) {
  if (!ids || !steps?.some((item) => item.subject)) return steps || [];
  return steps.map((item) => {
    const personId = item.subject ? ids[item.subject] : '';
    if (!personId || !SUBJECT_PATHS[item.subject]) return item;
    const id = encodeURIComponent(personId);
    const path = SUBJECT_PATHS[item.subject](id);
    const route = item.profileTab ? `${path}?tab=${item.profileTab}` : path;
    return { ...item, route };
  });
}

export function needsNavigation(location, step) {
  if (!step?.route) return false;
  if (!matchesRoute(location, step.route)) return true;
  if (step.routeState && !location?.state?.filters) return true;
  return false;
}

export function resolveRoute(route, user) {
  if (typeof route === 'function') return route(user) || '';
  return route || '';
}

export function matchesRoute(location, route) {
  if (!route) return true;
  const qIndex = route.indexOf('?');
  const path = qIndex === -1 ? route : route.slice(0, qIndex);
  const query = qIndex === -1 ? '' : route.slice(qIndex + 1);
  if (location?.pathname !== path) return false;
  if (!query) return true;
  const expected = new URLSearchParams(query);
  const actual = new URLSearchParams(location.search || '');
  for (const [key, value] of expected.entries()) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

export function featureAllowed(feature, hasFeature) {
  if (!feature) return true;
  if (typeof hasFeature !== 'function') return true;
  const keys = Array.isArray(feature) ? feature : [feature];
  return keys.some((key) => hasFeature(key));
}

function passesGate(item, user, hasFeature) {
  if (!user) return false;
  if (item.roles?.length && !item.roles.includes(user.role)) return false;
  if (item.access && !hasAccess(user, item.access)) return false;
  if (!featureAllowed(item.feature, hasFeature)) return false;
  return true;
}

export function findTutorialScenario(id) {
  for (const section of tutorialSections) {
    for (const scenario of section.scenarios) {
      if (scenario.id === id) return scenario;
    }
  }
  return undefined;
}

export function visibleSteps(scenario, user, hasFeature) {
  if (!scenario || !passesGate(scenario, user, hasFeature)) return [];
  return (scenario.steps || [])
    .filter((item) => {
      if (item.roles?.length && !item.roles.includes(user.role)) return false;
      if (item.access && !hasAccess(user, item.access)) return false;
      if (item.feature && !featureAllowed(item.feature, hasFeature)) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      route: resolveRoute(item.route, user),
    }));
}

export function sectionsForUser(user, hasFeature) {
  return tutorialSections
    .map((section) => ({
      ...section,
      scenarios: section.scenarios
        .map((scenario) => ({
          ...scenario,
          steps: visibleSteps(scenario, user, hasFeature),
        }))
        .filter((scenario) => scenario.steps.length > 0),
    }))
    .filter((section) => section.scenarios.length > 0);
}
