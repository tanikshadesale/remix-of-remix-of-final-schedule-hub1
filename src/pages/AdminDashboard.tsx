import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollegeStore } from '@/store/collegeStore';
import { Loader2 } from 'lucide-react';
import SubjectManager from '@/components/admin/SubjectManager';
import DivisionManager from '@/components/admin/DivisionManager';
import FacultyManager from '@/components/admin/FacultyManager';
import TimetableManager from '@/components/admin/TimetableManager';
import ResourceView from '@/components/admin/ResourceView';
import ResourceAvailabilityView from '@/components/admin/ResourceAvailabilityView';
import AdminLayout from '@/components/layout/AdminLayout';
import { useDbSync } from '@/hooks/useDbSync';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, departments } = useCollegeStore();
  const { loading, error } = useDbSync();
  const [activeTab, setActiveTab] = useState('timetable');

  if (!currentUser || currentUser.role !== 'admin') {
    navigate('/');
    return null;
  }

  const dept = departments.find(d => d.id === currentUser.departmentId);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading data…</span>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'timetable': return <TimetableManager departmentId={currentUser.departmentId!} />;
      case 'subjects': return <SubjectManager departmentId={currentUser.departmentId!} />;
      case 'divisions': return <DivisionManager departmentId={currentUser.departmentId!} />;
      case 'faculty': return <FacultyManager departmentId={currentUser.departmentId!} />;
      case 'resources': return <ResourceView departmentId={currentUser.departmentId!} />;
      case 'availability': return <ResourceAvailabilityView departmentId={currentUser.departmentId!} />;
      default: return null;
    }
  };

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab} deptName={dept?.name || 'Department'}>
      {error && (
        <div className="mb-4 bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          Database error: {error}. Showing cached data.
        </div>
      )}
      {renderContent()}
    </AdminLayout>
  );
};

export default AdminDashboard;
