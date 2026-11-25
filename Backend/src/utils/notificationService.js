const Notification = require("../models/Notification");

async function revokeStaleMemberAssignedNotifications({ memberId, currentRecipientId }) {
    const filter = {
        member: memberId,
        type: "member_assigned",
        read: false,
    };
    if (currentRecipientId) {
        filter.recipient = { $ne: currentRecipientId };
    }
    await Notification.updateMany(filter, { $set: { read: true } });
}

async function notifyMemberAssigned({ recipientId, member, actorId }) {
    if (!recipientId || !member) return null;

    const recipientStr = recipientId.toString();
    if (actorId && recipientStr === actorId.toString()) return null;

    await revokeStaleMemberAssignedNotifications({
        memberId: member._id,
        currentRecipientId: recipientId,
    });

    const memberName = member.name || "A member";
    return Notification.create({
        recipient: recipientId,
        type: "member_assigned",
        title: "New member assigned",
        message: `${memberName} has been assigned to you`,
        member: member._id,
        createdBy: actorId || null,
    });
}

async function notifyTaskAssigned({ recipientId, members = [], member = null, actorId, taskId }) {
    if (!recipientId) return null;

    const list = Array.isArray(members) && members.length > 0
        ? members
        : (member ? [member] : []);

    if (list.length === 0) return null;

    const recipientStr = recipientId.toString();
    if (actorId && recipientStr === actorId.toString()) return null;

    const count = list.length;
    let message = "";
    let singleMemberId = null;

    if (count === 1) {
        const memberName = list[0]?.name || "A member";
        message = `${memberName} has been assigned to you as a task. Check your tasks page to view this member.`;
        singleMemberId = list[0]?._id || null;
    } else {
        message = `${count} members have been assigned to you as a task. Check your tasks page to view those ${count} members.`;
    }

    return Notification.create({
        recipient: recipientId,
        type: "task_assigned",
        title: "Tasks",
        message,
        member: singleMemberId,
        createdBy: actorId || null,
        metadata: {
            taskId: taskId ? taskId.toString() : null,
            memberCount: count,
            memberIds: list.map((m) => (m?._id ? m._id.toString() : String(m))),
        },
    });
}

async function notifyPackageExceptionPending({
    recipientId,
    member,
    actorId,
    requestId,
    salesManagerName,
    packageName,
    hasException = true,
    message: customMessage,
}) {
    if (!recipientId || !member) return null;

    const memberName = member.name || "a member";
    const managerName = salesManagerName || "A sales manager";
    const pkgName = packageName || "a package";
    const message = customMessage || (hasException
        ? `${managerName} added package ${pkgName} with exception to member ${memberName}`
        : `${managerName} requested package ${pkgName} for member ${memberName}`);

    return Notification.create({
        recipient: recipientId,
        type: "package_exception_pending",
        title: hasException ? "Package exception pending approval" : "Package request pending approval",
        message,
        member: member._id,
        createdBy: actorId || null,
        metadata: { requestId: requestId?.toString(), hasException: Boolean(hasException) },
    });
}

async function notifyCoachRepRequestPending({ recipientId, member, actorId, requestId, coachRepName, isTakeover }) {
    if (!recipientId || !member) return null;

    const repName = coachRepName || "A coach";
    const memberName = member.name || "a member";
    const action = isTakeover ? "take over" : "be assigned to";
    const message = `${repName} requested to ${action} member ${memberName}`;

    return Notification.create({
        recipient: recipientId,
        type: "coach_rep_request_pending",
        title: "Coach assignment change request",
        message,
        member: member._id,
        createdBy: actorId || null,
        metadata: { requestId: requestId?.toString() },
    });
}

async function notifySalesRepRequestPending({ recipientId, member, actorId, requestId, salesRepName, isTakeover }) {
    if (!recipientId || !member) return null;

    const repName = salesRepName || "A sales representative";
    const memberName = member.name || "a member";
    const action = isTakeover ? "take over" : "be assigned to";
    const message = `${repName} requested to ${action} member ${memberName}`;

    return Notification.create({
        recipient: recipientId,
        type: "sales_rep_request_pending",
        title: "Sales representative change request",
        message,
        member: member._id,
        createdBy: actorId || null,
        metadata: { requestId: requestId?.toString() },
    });
}

async function notifyPackageExceptionResolved({ recipientId, member, actorId, status, requestId }) {
    if (!recipientId || !member) return null;

    const memberName = member.name || "A member";
    const label = status === "accepted" ? "approved" : "rejected";
    return Notification.create({
        recipient: recipientId,
        type: "package_exception_resolved",
        title: `Package exception ${label}`,
        message: `Your package exception for ${memberName} was ${label}`,
        member: member._id,
        createdBy: actorId || null,
        metadata: { requestId: requestId?.toString(), status },
    });
}

/**
 * Notify the gym staff who asked Forma to resolve a cross-tenant staff conflict.
 * Must run under the requesting tenant context (or pass tenantId for runWithTenant).
 */
async function notifyStaffIdentityResolved({
    recipientId,
    tenantId,
    tenantSlug,
    status,
    staffName,
    sourceTenantName,
    requestingTenantName,
    requestId,
    adminNote,
}) {
    if (!recipientId || !tenantId || !status) return null;

    const name = staffName || "This staff member";
    const sourceGym = sourceTenantName || "another gym";
    const thisGym = requestingTenantName || "your gym";

    let title = "Staff access request update";
    let message = "";
    if (status === "approved_dual") {
        title = "Staff access approved for both gyms";
        message = `Forma support approved ${name} to work at both ${sourceGym} and ${thisGym}. They can pick a gym when signing in.`;
    } else if (status === "approved_transfer") {
        title = "Staff transferred to your gym";
        message = `Forma support transferred ${name} to ${thisGym}. Their previous gym access was removed.`;
    } else if (status === "rejected") {
        title = "Staff access request rejected";
        message = `Forma support rejected the request to add ${name} from ${sourceGym} to ${thisGym}.`;
    } else {
        message = `Forma support updated your staff access request for ${name}.`;
    }
    if (adminNote) {
        message = `${message} Note: ${adminNote}`;
    }

    const { runWithTenant, isPlatformContext, getTenantId } = require("../context/tenantContext");
    const create = () => Notification.create({
        recipient: recipientId,
        type: "staff_identity_resolved",
        title,
        message,
        createdBy: null,
        metadata: {
            requestId: requestId ? String(requestId) : null,
            status,
            sourceTenantName: sourceGym,
            requestingTenantName: thisGym,
        },
        dedupeKey: requestId ? `staff_identity_resolved:${requestId}` : undefined,
    });

    if (!isPlatformContext() && String(getTenantId() || "") === String(tenantId)) {
        return create();
    }
    return runWithTenant(
        { tenantId: String(tenantId), tenantSlug: tenantSlug || null },
        create
    );
}

module.exports = {
    notifyMemberAssigned,
    notifyTaskAssigned,
    notifyPackageExceptionPending,
    notifyPackageExceptionResolved,
    notifySalesRepRequestPending,
    notifyCoachRepRequestPending,
    notifyStaffIdentityResolved,
    revokeStaleMemberAssignedNotifications,
};
