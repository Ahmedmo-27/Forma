import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canUserAssignTasks, canUserReceiveTasks } from './tasks/taskMembers';
import AssigningTasksPage from './tasks/AssigningTasksPage';
import AssignedTasksPage from './tasks/AssignedTasksPage';

/**
 * Tasks router
 *
 * - Coach / Sales: assigned inbox (tasks given to them)
 * - Head Coach / Sales Manager / Owner / GM: assigner desk only (bulk/quick assign)
 */
export default function Tasks() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedView = String(searchParams.get('view') || '').toLowerCase();

  const canAssign = canUserAssignTasks(user);
  const canReceive = canUserReceiveTasks(user);

  if ((requestedView === 'assigned' || requestedView === 'my_tasks') && canReceive) {
    return <AssignedTasksPage />;
  }

  if ((requestedView === 'assigning' || requestedView === 'assign') && canAssign) {
    return <AssigningTasksPage />;
  }

  // Head Coach and other assigners land on the assigner desk (includes "My Assigned Tasks" tab).
  if (canAssign) {
    return <AssigningTasksPage />;
  }

  // Coach (and Sales) land on the assigned inbox.
  return <AssignedTasksPage />;
}
