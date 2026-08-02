import "server-only";

import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { HistoryIcon, Settings05Icon } from "@hugeicons/core-free-icons";
import { getSession } from "@/lib/auth";
import { connectToDatabase, User, type IUserChat } from "@/lib/db/models";
import { TobuLogo } from "@/components/tobu-logo";
import Link from "next/link";

export async function AppSidebar({
    ...props
}: React.ComponentProps<typeof Sidebar>) {
    const session = await getSession();
    if (!session.userId) return null;

    await connectToDatabase();
    const user = await User.findById(session.userId, {
        name: 1,
        email: 1,
        image: 1,
        chats: 1,
    }).lean<{
        name: string;
        email: string;
        image?: string;
        chats?: IUserChat[];
    } | null>();

    const display = user
        ? { name: user.name, email: user.email, avatar: user.image ?? "" }
        : { name: "Unknown user", email: "", avatar: "" };

    const chats = [...(user?.chats ?? [])].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const historyItems =
        chats.length > 0
            ? chats.map((chat) => {
                  const shortId = chat.chatId.slice(0, 8);
                  const rawTitle = chat.title?.trim() || "New chat";
                  const title =
                      rawTitle.toLowerCase() === "new chat"
                          ? `New chat · ${shortId}`
                          : rawTitle;
                  return {
                      title,
                      url: `/chat/${chat.chatId}`,
                  };
              })
            : [{ title: "No chats yet", url: "/chat" }];

    const navMain = [
        {
            title: "History",
            url: "/chat",
            icon: <HugeiconsIcon icon={HistoryIcon} strokeWidth={2} />,
            isActive: true,
            items: historyItems,
        },
    ];

    const navSecondary = [
        {
            title: "Settings",
            url: "/settings",
            icon: <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />,
        },
    ];

    return (
        <Sidebar variant="inset" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            render={<Link href="/chat" />}
                        >
                            <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                                <TobuLogo size={32} className="size-8" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">
                                    Tobu AI
                                </span>
                                <span className="truncate text-xs">
                                    Study companion
                                </span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navMain} label="Chats" />
                <NavSecondary items={navSecondary} className="mt-auto" />
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={display} />
            </SidebarFooter>
        </Sidebar>
    );
}
