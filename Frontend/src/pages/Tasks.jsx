import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canUserAssignTasks, canUserReceiveTasks, getTaskPlayerType, TASK_PLAYER_TYPES } from './tasks/taskMembers';
import AssigningTasksPage from './tasks/AssigningTasksPage';
import AssignedTasksPage from './tasks/AssignedTasksPage';

/**
 * Tasks Page Router
 * Automatically determines and renders the appropriate page interface
 * based on the user's role and capability:
 *
 * 1. Roles that only assign tasks (Owner, General Manager, Sales Manager):
 *    Never receive tasks; rendered exclusively with AssigningTasksPage.
 *
 * 2. Assigning Players who also can receive tasks (e.g. Head Coach):
 *    Rendered with AssigningTasksPage with switching capability.
 *
 * 3. Assigned Players (Regular Sales, Coach):
 *    Rendered with AssignedTasksPage for active tasks and history.
 */
export default function Tasks() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view'); // e.g. ?view=assigned or ?view=assigning

  const canAssign = canUserAssignTasks(user);
  const canReceive = canUserReceiveTasks(user);
  const playerType = getTaskPlayerType(user);

  // If a user can receive tasks and explicitly asks to view their assigned tasks via URL param, honor it
  if (canReceive && (requestedView === 'assigned' || requestedView === 'my_tasks')) {
    return <AssignedTasksPage />;
  }

  // Assigning player (Sales Manager, Head Coach, Owner, General Manager)
  if (playerType === TASK_PLAYER_TYPES.ASSIGNING) {
    return <AssigningTasksPage />;
  }

  // Assigned player (Regular Sales, Coach)
  return <AssignedTasksPage />;
}
