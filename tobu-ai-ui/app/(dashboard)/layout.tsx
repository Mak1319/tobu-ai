import { AppSidebar } from "@/components/app-sidebar";
import { DashboardBreadcrumbs } from "@/components/dashboard-breadcrumbs";
import { Separator } from "@/components/ui/separator";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";

export default function Page({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider className="no-scrollbar">
            <AppSidebar />
            <SidebarInset className="overflow-hidden no-scrollbar">
                <header className="flex h-16 shrink-0 items-center gap-2">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4 mt-2"
                        />
                        <DashboardBreadcrumbs />
                    </div>
                </header>
                <div className="flex w-full max-w-7xl min-h-full flex-1 overflow-y-scroll no-scrollbar flex-col gap-4 p-4 pt-0 ">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
