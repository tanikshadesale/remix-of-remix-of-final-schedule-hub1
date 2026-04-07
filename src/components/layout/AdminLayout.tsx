import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCollegeStore } from '@/store/collegeStore';
import { Calendar, Users, BookOpen, Layers, DoorOpen, BarChart3, LogOut, GraduationCap, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { title: 'Timetable', value: 'timetable', icon: Calendar },
  { title: 'Subjects', value: 'subjects', icon: BookOpen },
  { title: 'Divisions', value: 'divisions', icon: Layers },
  { title: 'Faculty', value: 'faculty', icon: Users },
  { title: 'Resources', value: 'resources', icon: DoorOpen },
  { title: 'Availability', value: 'availability', icon: BarChart3 },
];

interface Props {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  deptName: string;
}

function SidebarNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
          <GraduationCap className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && <span className="font-semibold text-sm text-foreground">Smart Timetable</span>}
      </div>
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => onTabChange(item.value)}
                    className={cn(
                      'w-full justify-start gap-3 px-3 py-2 text-sm font-medium transition-colors',
                      activeTab === item.value
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

const AdminLayout = ({ children, activeTab, onTabChange, deptName }: Props) => {
  const navigate = useNavigate();
  const { logout } = useCollegeStore();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SidebarNav activeTab={activeTab} onTabChange={onTabChange} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border bg-card px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="h-5 w-px bg-border" />
              <div>
                <h1 className="text-sm font-semibold text-foreground leading-tight">{deptName}</h1>
                <p className="text-xs text-muted-foreground">Admin Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { logout(); navigate('/'); }}
              >
                <LogOut className="mr-1.5 h-4 w-4" />
                Logout
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
