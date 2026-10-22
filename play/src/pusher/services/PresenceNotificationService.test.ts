import { describe, expect, it, vi } from "vitest";

vi.mock("../enums/EnvironmentVariable", () => ({
    PRESENCE_NOTIFICATION_URL: undefined,
    PRESENCE_NOTIFICATION_SECRET: undefined,
    PRESENCE_NOTIFICATION_ROOM_URL: undefined,
    PRESENCE_NOTIFICATION_COOLDOWN_SECONDS: 300,
}));

import type { PresenceRoom } from "./PresenceNotificationService";
import { PresenceNotificationService } from "./PresenceNotificationService";

const config = {
    url: "http://teo-auth:3000/internal/presence-notification",
    secret: "test-secret",
    roomUrl: "https://teo.docker/map-storage/office/the-everywhere-office.wam",
    cooldownSeconds: 300,
};

function room(connectionCount = 1): PresenceRoom {
    return {
        roomUrl: config.roomUrl,
        countPresentConnections: () => connectionCount,
        getPresentUsers: () => [
            { uuid: "visitor@example.com", name: "Visitor" },
            { uuid: "colleague@example.com", name: "Colleague" },
        ],
    };
}

describe("PresenceNotificationService", () => {
    it("posts the joined user and current attendees", async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202, text: () => Promise.resolve("") });
        const service = new PresenceNotificationService(config, fetcher, () => 1_000_000);

        await service.notifyUserJoined(room(), { uuid: "visitor@example.com", name: "Visitor" });

        expect(fetcher).toHaveBeenCalledOnce();
        const [url, request] = fetcher.mock.calls[0];
        expect(url).toBe(config.url);
        expect(request.headers.authorization).toBe("Bearer test-secret");
        expect(JSON.parse(request.body)).toEqual({
            roomUrl: config.roomUrl,
            joinedUser: { uuid: "visitor@example.com", name: "Visitor" },
            attendees: [
                { uuid: "visitor@example.com", name: "Visitor" },
                { uuid: "colleague@example.com", name: "Colleague" },
            ],
        });
    });

    it("suppresses duplicate tabs and reconnects within the cooldown", async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202, text: () => Promise.resolve("") });
        let now = 1_000_000;
        const service = new PresenceNotificationService(config, fetcher, () => now);
        const user = { uuid: "visitor@example.com", name: "Visitor" };

        await service.notifyUserJoined(room(2), user);
        await service.notifyUserJoined(room(), user);
        now += 60_000;
        await service.notifyUserJoined(room(), user);
        now += 300_000;
        await service.notifyUserJoined(room(), user);

        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("does nothing for another room or incomplete configuration", async () => {
        const fetcher = vi.fn();
        const service = new PresenceNotificationService(config, fetcher);
        const otherRoom = { ...room(), roomUrl: "https://teo.docker/map-storage/office/other.wam" };

        await service.notifyUserJoined(otherRoom, { uuid: "visitor@example.com", name: "Visitor" });
        await new PresenceNotificationService({ ...config, secret: undefined }, fetcher).notifyUserJoined(room(), {
            uuid: "visitor@example.com",
            name: "Visitor",
        });

        expect(fetcher).not.toHaveBeenCalled();
    });
});
