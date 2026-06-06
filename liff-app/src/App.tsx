import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./screens/Dashboard";
import TxEdit from "./screens/TxEdit";
import Onboarding from "./screens/Onboarding";
// NOTE: some of these modules may not exist yet (created by other batches).
// TS errors here are expected until batches 1/2 land.
import Accounts from "./screens/Accounts";
import AccountDetail from "./screens/AccountDetail";
import Transfer from "./screens/Transfer";
import GroupDetail from "./screens/GroupDetail";
import TxList from "./screens/TxList";
import TxNew from "./screens/TxNew";
import Settings from "./screens/Settings";
import Budgets from "./screens/Budgets";
import Recurring from "./screens/Recurring";
import DataIO from "./screens/DataIO";
import Overview from "./screens/Overview";
import Groups from "./screens/Groups";
import Help from "./screens/Help";
import Terms from "./screens/Terms";
import TabBar from "./components/TabBar";

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/overview" element={<Overview />} />
      <Route path="/onboarding" element={<Onboarding />} />

      <Route path="/accounts" element={<Accounts />} />
      <Route path="/accounts/:id" element={<AccountDetail />} />

      <Route path="/transfer" element={<Transfer />} />

      <Route path="/groups" element={<Groups />} />
      <Route path="/group/:groupId" element={<GroupDetail />} />
      <Route path="/group/:groupId/tx" element={<TxList />} />
      <Route path="/group/:groupId/tx/new" element={<TxNew />} />

      <Route path="/tx" element={<TxList />} />
      <Route path="/tx/new" element={<TxNew />} />
      <Route path="/tx/:txId/edit" element={<TxEdit />} />

      <Route path="/settings" element={<Settings />} />
      <Route path="/budgets" element={<Budgets />} />
      <Route path="/recurring" element={<Recurring />} />
      <Route path="/data" element={<DataIO />} />
      <Route path="/help" element={<Help />} />
      <Route path="/terms" element={<Terms />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    <TabBar />
    </>
  );
}
