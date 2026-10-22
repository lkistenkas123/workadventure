import * as Sentry from "@sentry/node";
import {
    PRESENCE_NOTIFICATION_COOLDOWN_SECONDS,
    PRESENCE_NOTIFICATION_ROOM_URL,
    PRESENCE_NOTIFICATION_SECRET,
    PRESENCE_NOTIFICATION_URL,
} from "../enums/EnvironmentVariable";

export type PresentUser = { uuid: string; name: string };

export interface PresenceRoom {
    readonly roomUrl: string;
    countPresentConnections(userUuid: string): number;
    getPresentUsers(): PresentUser[];
}

type FetchResponse = { ok: boolean; status: number; text(): Promise<string> };
type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponse>;

export type PresenceNotificationConfig = {
    url?: string;
    secret?: string;
    roomUrl?: string;
    cooldownSeconds: number;
};

export class PresenceNotificationService {
    private readonly lastNotification = new Map<string, number>();

    public constructor(
        private readonly config: PresenceNotificationConfig,
        private readonly fetcher: FetchLike = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    public async notifyUserJoined(room: PresenceRoom, joinedUser: PresentUser): Promise<void> {
        const { url, secret, roomUrl, cooldownSeconds } = this.config;
        if (!url || !secret || !roomUrl || room.roomUrl !== roomUrl) {
            return;
        }

        // A second tab or a briefly overlapping reconnect is not a new office arrival.
        if (room.countPresentConnections(joinedUser.uuid) !== 1) {
            return;
        }

        const notificationKey = `${room.roomUrl}\u0000${joinedUser.uuid}`;
        const now = this.now();
        for (const [key, notifiedAt] of this.lastNotification) {
            if (now - notifiedAt >= cooldownSeconds * 1000) {
                this.lastNotification.delete(key);
            }
        }
        const previousNotification = this.lastNotification.get(notificationKey);
        if (previousNotification !== undefined && now - previousNotification < cooldownSeconds * 1000) {
            return;
        }

        this.lastNotification.set(notificationKey, now);
        try {
            const response = await this.fetcher(url, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${secret}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    roomUrl: room.roomUrl,
                    joinedUser,
                    attendees: room.getPresentUsers(),
                }),
                signal: AbortSignal.timeout(5_000),
            });

            if (!response.ok) {
                throw new Error(`Presence notification webhook returned HTTP ${response.status}: ${await response.text()}`);
            }
        } catch (error) {
            // Allow a retry after a transient delivery failure.
            this.lastNotification.delete(notificationKey);
            console.error("Could not deliver presence notification", error);
            Sentry.captureException(error);
        }
    }
}

export const presenceNotificationService = new PresenceNotificationService({
    url: PRESENCE_NOTIFICATION_URL,
    secret: PRESENCE_NOTIFICATION_SECRET,
    roomUrl: PRESENCE_NOTIFICATION_ROOM_URL,
    cooldownSeconds: PRESENCE_NOTIFICATION_COOLDOWN_SECONDS,
});
