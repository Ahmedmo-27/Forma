import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canUserAssignTasks, getTaskPlayerType, TASK_PLAYER_TYPES } from './tasks/taskMembers';
import AssigningTasksPage from './tasks/AssigningTasksPage';
import AssignedTasksPage from './tasks/AssignedTasksPage';

/**
 * Tasks Page Router
 * Automatically determines and renders the appropriate page interface
 * based on the user's player type:
 *
 * 1. Assigning Player (Sales Manager, Coach Manager, Owner, General Manager):
 *    Renders the AssigningTasksPage with task creation, member scheduling, and created tasks history.
 *
 * 2. Assigned Player (Regular Sales, Coach):
 *    Renders the AssignedTasksPage with active assigned tasks and completion history,
 *    strictly isolated from assigner endpoints to prevent permission errors.
 */
export default function Tasks() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view'); // e.g. ?view=assigned or ?view=assigning

  const canAssign = canUserAssignTasks(user);
  const playerType = getTaskPlayerType(user);

  // If a manager explicitly asks to view their assigned tasks via URL param, honor it
  if (canAssign && (requestedView === 'assigned' || requestedView === 'my_tasks')) {
    return <AssignedTasksPage />;
  }

  // Assigning player (Sales Manager, Coach Manager, Owner, General Manager)
  if (playerType === TASK_PLAYER_TYPES.ASSIGNING) {
    return <AssigningTasksPage />;
  }

  // Assigned player (Regular Sales, Coach)
  return <AssignedTasksPage />;
}
