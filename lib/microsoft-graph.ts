const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphFetch<T>(
  accessToken: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Graph API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MailMessage = {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  importance: "low" | "normal" | "high";
  hasAttachments: boolean;
  webLink: string;
};

export type CalendarEvent = {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location: {
    displayName: string;
  };
  attendees: {
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response: string;
      time: string;
    };
    type: string;
  }[];
  isOnlineMeeting: boolean;
  onlineMeeting?: {
    joinUrl: string;
  };
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  bodyPreview: string;
  webLink: string;
  isAllDay: boolean;
};

export type TeamsChat = {
  id: string;
  topic?: string;
  chatType: "oneOnOne" | "group" | "meeting";
  lastUpdatedDateTime: string;
  lastMessagePreview?: {
    createdDateTime: string;
    isDeleted?: boolean;
    messageType?: string;
    body?: { contentType: string; content: string };
    from?: {
      user?: { displayName: string; id: string };
      application?: { displayName: string };
    };
  };
  members?: {
    displayName: string;
    email?: string;
  }[];
};

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export async function getMailMessages(
  accessToken: string,
  top = 20,
): Promise<MailMessage[]> {
  const params = new URLSearchParams({
    $top: String(top),
    $orderby: "receivedDateTime desc",
    $select: "id,subject,from,receivedDateTime,bodyPreview,isRead,importance,hasAttachments,webLink",
  });

  const data = await graphFetch<{ value: MailMessage[] }>(
    accessToken,
    `/me/mailFolders/inbox/messages?${params.toString()}`,
  );

  return data.value;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function getCalendarEvents(
  accessToken: string,
): Promise<CalendarEvent[]> {
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);

  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: sevenDaysLater.toISOString(),
    $top: "20",
    $orderby: "start/dateTime",
    $select: "id,subject,start,end,location,attendees,isOnlineMeeting,onlineMeeting,organizer,bodyPreview,webLink,isAllDay",
  });

  const data = await graphFetch<{ value: CalendarEvent[] }>(
    accessToken,
    `/me/calendarView?${params.toString()}`,
  );

  return data.value;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function getTeamsChats(
  accessToken: string,
): Promise<TeamsChat[]> {
  // $orderby is not supported on this endpoint — sort client-side.
  // lastMessagePreview gives the actual last-message timestamp so the sort
  // matches what the real Teams client shows.
  const params = new URLSearchParams({
    $top: "50",
    $expand: "members,lastMessagePreview",
  });

  const data = await graphFetch<{ value: TeamsChat[] }>(
    accessToken,
    `/me/chats?${params.toString()}`,
  );

  // Sort by last real message time, falling back to chat metadata time.
  data.value.sort((a, b) => {
    const tA = a.lastMessagePreview?.createdDateTime ?? a.lastUpdatedDateTime;
    const tB = b.lastMessagePreview?.createdDateTime ?? b.lastUpdatedDateTime;
    return new Date(tB).getTime() - new Date(tA).getTime();
  });

  return data.value;
}

// ---------------------------------------------------------------------------
// Chat Messages
// ---------------------------------------------------------------------------

export type ChatMessage = {
  id: string;
  createdDateTime: string;
  from: {
    user?: { displayName: string; id: string };
    application?: { displayName: string };
  } | null;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  messageType: string;
  deletedDateTime: string | null;
};

export async function getChatMessages(
  accessToken: string,
  chatId: string,
  top = 50,
): Promise<ChatMessage[]> {
  const params = new URLSearchParams({
    $top: String(top),
    $orderby: "createdDateTime desc",
  });

  const data = await graphFetch<{ value: ChatMessage[] }>(
    accessToken,
    `/me/chats/${encodeURIComponent(chatId)}/messages?${params.toString()}`,
  );

  // Reverse so oldest is at top (natural chat order)
  return data.value.reverse();
}

// ---------------------------------------------------------------------------
// Send Mail
// ---------------------------------------------------------------------------

export async function sendMail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  await graphFetch<unknown>(accessToken, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
    }),
  });
}
