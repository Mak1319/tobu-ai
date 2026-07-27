import "server-only"

import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
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
import {
    ComputerTerminalIcon,
    RoboticIcon,
    BookOpen02Icon,
    Settings05Icon,
    ChartRingIcon,
    SentIcon,
    CropIcon,
    PieChartIcon,
    MapsIcon,
    CommandIcon,
} from "@hugeicons/core-free-icons";
import { getSession } from "@/lib/auth";
import { connectToDatabase, User } from "@/lib/db/models";

const navMain = [
    {
        title: "Playground",
        url: "#",
        icon: <HugeiconsIcon icon={ComputerTerminalIcon} strokeWidth={2} />,
        isActive: true,
        items: [
            { title: "History", url: "#" },
            { title: "Starred", url: "#" },
            { title: "Settings", url: "#" },
        ],
    },
    {
        title: "Models",
        url: "#",
        icon: <HugeiconsIcon icon={RoboticIcon} strokeWidth={2} />,
        items: [
            { title: "Genesis", url: "#" },
            { title: "Explorer", url: "#" },
            { title: "Quantum", url: "#" },
        ],
    },
    {
        title: "Documentation",
        url: "#",
        icon: <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} />,
        items: [
            { title: "Introduction", url: "#" },
            { title: "Get Started", url: "#" },
            { title: "Tutorials", url: "#" },
            { title: "Changelog", url: "#" },
        ],
    },
    {
        title: "Settings",
        url: "#",
        icon: <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />,
        items: [
            { title: "General", url: "#" },
            { title: "Team", url: "#" },
            { title: "Billing", url: "#" },
            { title: "Limits", url: "#" },
        ],
    },
];

const navSecondary = [
    {
        title: "Support",
        url: "#",
        icon: <HugeiconsIcon icon={ChartRingIcon} strokeWidth={2} />,
    },
    {
        title: "Feedback",
        url: "#",
        icon: <HugeiconsIcon icon={SentIcon} strokeWidth={2} />,
    },
];

const projects = [
    {
        name: "Design Engineering",
        url: "#",
        icon: <HugeiconsIcon icon={CropIcon} strokeWidth={2} />,
    },
    {
        name: "Sales & Marketing",
        url: "#",
        icon: <HugeiconsIcon icon={PieChartIcon} strokeWidth={2} />,
    },
    {
        name: "Travel",
        url: "#",
        icon: <HugeiconsIcon icon={MapsIcon} strokeWidth={2} />,
    },
];

export async function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const session = await getSession();
    if (!session.userId) return null;

    await connectToDatabase();
    const user = await User.findById(session.userId, {
        name: 1,
        email: 1,
        image: 1,
    }).lean<{ name: string; email: string; image?: string } | null>();

    // Stale cookie pointing at a deleted account — fall back to a neutral
    // placeholder so the sidebar doesn't crash.
    const display = user
        ? { name: user.name, email: user.email, avatar: user.image ?? "" }
        : { name: "Unknown user", email: "", avatar: "" };

    return (
        <Sidebar variant="inset" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" render={<a href="#" />}>
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                <HugeiconsIcon
                                    icon={CommandIcon}
                                    strokeWidth={2}
                                    className="size-4"
                                />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">
                                    Tobu AI
                                </span>
                                <span className="truncate text-xs">
                                    Enterprise
                                </span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navMain} />
                <NavProjects projects={projects} />
                <NavSecondary items={navSecondary} className="mt-auto" />
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={display} />
            </SidebarFooter>
        </Sidebar>
    );
}