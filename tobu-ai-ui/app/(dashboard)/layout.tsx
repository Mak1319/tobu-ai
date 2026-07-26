"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";

export default function Page({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    // Generate breadcrumb items based on pathname
    const getBreadcrumbItems = () => {
        const segments = pathname.split("/").filter(Boolean);
        const items: { label: string; href: string }[] = [];

        // Always start with Tobu AI
        items.push({ label: "Tobu AI", href: "/" });

        // Add other segments
        segments.forEach((segment, index) => {
            const href = "/" + segments.slice(0, index + 1).join("/");
            const label = segment
                .split("-")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
            items.push({ label, href });
        });

        return items;
    };

    const breadcrumbs = getBreadcrumbItems();

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4 mt-2"
                        />
                        {/*<Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="#">
                                        Build Your Application
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>
                                        Data Fetching
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>*/}
                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map((item, index) => (
                                    <React.Fragment key={item.href}>
                                        <BreadcrumbItem className="hidden md:block">
                                            {index < breadcrumbs.length - 1 ? (
                                                <BreadcrumbLink
                                                    href={item.href}
                                                >
                                                    {item.label}
                                                </BreadcrumbLink>
                                            ) : (
                                                <BreadcrumbPage>
                                                    {item.label}
                                                </BreadcrumbPage>
                                            )}
                                        </BreadcrumbItem>
                                        {index < breadcrumbs.length - 1 && (
                                            <BreadcrumbSeparator className="hidden md:block" />
                                        )}
                                    </React.Fragment>
                                ))}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
