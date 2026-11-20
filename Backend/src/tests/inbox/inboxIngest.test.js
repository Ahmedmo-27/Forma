import { createRequire } from "node:module";
import { describe, expect, it, vi, afterEach } from "vitest";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const InboxChannel = require("../../models/InboxChannel");
const InboxConversation = require("../../models/InboxConversation");
const InboxMessage = require("../../models/InboxMessage");
const Member = require("../../models/Member");
const inboxService = require("../../services/inbox/inboxService");
const { getTenantId } = require("../../context/tenantContext");

const tenantId = new mongoose.Types.ObjectId();
const channel = {
    _id: new mongoose.Types.ObjectId(),
    tenantId,
    type: "whatsapp",
};

function conversationDoc(extra = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        tenantId,
        channelId: channel._id,
        status: "open",
        lastMessageAt: new Date(0),
        // Member auto-linking is covered by its own test below.
        memberLinkAttempted: true,
        ...extra,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("inbox ingest", () => {
    it("stores a message and updates the conversation counters", async () => {
        const conversation = conversationDoc();
        const upsert = vi.spyOn(InboxConversation, "findOneAndUpdate");
        upsert.mockResolvedValueOnce({ value: conversation, lastErrorObject: { upserted: conversation._id } });
        upsert.mockReturnValueOnce({ lean: async () => ({ ...conversation, unreadCount: 1 }) });
        const create = vi.spyOn(InboxMessage, "create").mockResolvedValue({ _id: "m1" });

        const result = await inboxService.ingestMessage({
            channel,
            contactExternalId: "201001234567",
            contactName: "Sara",
            direction: "inbound",
            text: "Hello",
            externalMessageId: "mid.1",
            timestamp: 1700000000000,
        });

        expect(result.duplicate).toBe(false);
        expect(result.created).toBe(true);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            direction: "inbound",
            status: "received",
            externalMessageId: "mid.1",
        }));
        const counterUpdate = upsert.mock.calls[1][1];
        expect(counterUpdate.$inc).toEqual({ unreadCount: 1 });
        expect(counterUpdate.$set.lastMessageText).toBe("Hello");
    });

    it("treats a webhook retry (duplicate key) as already handled and changes no counters", async () => {
        const conversation = conversationDoc();
        const upsert = vi.spyOn(InboxConversation, "findOneAndUpdate")
            .mockResolvedValue({ value: conversation, lastErrorObject: {} });
        vi.spyOn(InboxMessage, "create").mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

        const result = await inboxService.ingestMessage({
            channel,
            contactExternalId: "201001234567",
            direction: "inbound",
            text: "Hello",
            externalMessageId: "mid.1",
            timestamp: Date.now(),
        });

        expect(result).toMatchObject({ duplicate: true, message: null });
        // Only the conversation upsert ran. Unread must not double-count.
        expect(upsert).toHaveBeenCalledTimes(1);
    });

    it("runs inside the channel's gym context", async () => {
        const seen = [];
        vi.spyOn(InboxConversation, "findOneAndUpdate").mockImplementation(() => {
            seen.push(getTenantId());
            return Promise.resolve({ value: conversationDoc(), lastErrorObject: {} });
        });
        vi.spyOn(InboxMessage, "create").mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

        await inboxService.ingestMessage({
            channel,
            contactExternalId: "201001234567",
            direction: "inbound",
            text: "x",
            externalMessageId: "mid.2",
        });
        expect(seen.map(String)).toEqual([String(tenantId)]);
    });

    it("reopens a finished thread when the contact writes again", async () => {
        const conversation = conversationDoc({ status: "done" });
        const upsert = vi.spyOn(InboxConversation, "findOneAndUpdate");
        upsert.mockResolvedValueOnce({ value: conversation, lastErrorObject: {} });
        upsert.mockReturnValueOnce({ lean: async () => ({ ...conversation, status: "open" }) });
        vi.spyOn(InboxMessage, "create").mockResolvedValue({ _id: "m2" });

        await inboxService.ingestMessage({
            channel,
            contactExternalId: "201001234567",
            direction: "inbound",
            text: "Are you open?",
            externalMessageId: "mid.3",
            timestamp: new Date(),
        });
        expect(upsert.mock.calls[1][1].$set).toMatchObject({ status: "open", snoozedUntil: null });
    });

    it("ignores empty messages and missing contacts", async () => {
        const upsert = vi.spyOn(InboxConversation, "findOneAndUpdate");
        expect(await inboxService.ingestMessage({ channel, contactExternalId: "201001234567", direction: "inbound", text: "" })).toBeNull();
        expect(await inboxService.ingestMessage({ channel, contactExternalId: "", direction: "inbound", text: "hi" })).toBeNull();
        expect(upsert).not.toHaveBeenCalled();
    });

    it("links a WhatsApp contact to a member by phone, once", async () => {
        const waChannel = { ...channel, type: "whatsapp" };
        const conversation = conversationDoc({ contactExternalId: "201001234567", memberLinkAttempted: false });
        const upsert = vi.spyOn(InboxConversation, "findOneAndUpdate");
        upsert.mockResolvedValueOnce({ value: conversation, lastErrorObject: {} });
        upsert.mockReturnValueOnce({ lean: async () => conversation });
        vi.spyOn(InboxMessage, "create").mockResolvedValue({ _id: "m3" });
        const memberId = new mongoose.Types.ObjectId();
        vi.spyOn(Member, "findOne").mockReturnValue({ select: () => ({ lean: async () => ({ _id: memberId, name: "Omar" }) }) });
        const updateOne = vi.spyOn(InboxConversation, "updateOne").mockResolvedValue({});

        await inboxService.ingestMessage({
            channel: waChannel,
            contactExternalId: "201001234567",
            direction: "inbound",
            text: "Hi",
            externalMessageId: "WA1",
        });

        expect(updateOne).toHaveBeenCalledWith(
            { _id: conversation._id },
            { $set: expect.objectContaining({ memberLinkAttempted: true, memberId, contactName: "Omar" }) }
        );
    });
});

describe("inbox models", () => {
    const models = { InboxChannel, InboxConversation, InboxMessage };

    it("scope every query to the gym and require tenantId", () => {
        for (const [name, model] of Object.entries(models)) {
            expect(model.schema.path("tenantId"), name).toBeDefined();
            expect(model.schema.path("tenantId").isRequired, name).toBe(true);
            for (const hook of ["find", "findOne", "countDocuments", "updateMany", "updateOne"]) {
                expect(model.schema.s.hooks._pres.get(hook)?.length, `${name}.${hook}`).toBeGreaterThan(0);
            }
        }
    });

    it("dedupes messages per channel with a partial unique index", () => {
        const index = InboxMessage.schema.indexes()
            .find(([, options]) => options.name === "channel_external_message_unique");
        expect(index).toBeDefined();
        expect(index[0]).toEqual({ channelId: 1, externalMessageId: 1 });
        expect(index[1].unique).toBe(true);
        expect(index[1].partialFilterExpression).toBeDefined();
    });

    it("keeps one conversation per contact per channel", () => {
        const index = InboxConversation.schema.indexes()
            .find(([keys, options]) => options.unique && keys.contactExternalId === 1);
        expect(index[0]).toEqual({ tenantId: 1, channelId: 1, contactExternalId: 1 });
    });

    it("is WhatsApp-only and holds no third-party access token", () => {
        expect(InboxChannel.schema.path("type").enumValues).toEqual(["whatsapp"]);
        expect(InboxConversation.schema.path("channelType").enumValues).toEqual(["whatsapp"]);
        expect(InboxMessage.schema.path("channelType").enumValues).toEqual(["whatsapp"]);
        expect(InboxChannel.schema.path("accessToken")).toBeUndefined();
        expect(InboxChannel.schema.path("pageId")).toBeUndefined();
    });

    it("keeps one channel per gym, type, and linked number", () => {
        const index = InboxChannel.schema.indexes()
            .find(([keys, options]) => options.unique && keys.externalId === 1 && keys.tenantId === 1);
        expect(index[0]).toEqual({ tenantId: 1, type: 1, externalId: 1 });
    });
});
