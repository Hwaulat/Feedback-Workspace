import type { Customer, FeedbackItem, HistoryEntry } from './feedback-model';
export const demoCustomers: Customer[] = [
  { id:'00000000-0000-4000-8000-000000000001', name:'Acme Corporation', active:true, pin_version:1, created_at:'2026-09-01' },
  { id:'00000000-0000-4000-8000-000000000002', name:'Nusantara Digital', active:true, pin_version:1, created_at:'2026-09-04' },
  { id:'00000000-0000-4000-8000-000000000003', name:'Atlas Logistics', active:true, pin_version:1, created_at:'2026-09-08' },
  { id:'00000000-0000-4000-8000-000000000004', name:'Meridian Group', active:true, pin_version:1, created_at:'2026-09-12' },
];
const examples = [
  ['Login & Access','Unable to reset password','Bug Report','Major','Execution','In progress','2026-10-14'],
  ['Reporting','Add monthly export to reports','Change Request','Medium','Execution','In progress','2026-10-18'],
  ['Work Orders','Work order status not updating','Bug Report','Major','Waiting','Pending','2026-10-09'],
  ['Inventory','Stock count discrepancy','Bug Report','Medium','Execution','Done','2026-10-08'],
  ['Dashboard','Improve dashboard loading speed','Complaint','Medium','Execution by notes','In progress','2026-10-15'],
  ['Notifications','Duplicate email notifications','Bug Report','Minor','Execution','Done','2026-10-10'],
  ['Reporting','Filter reports by department','Change Request','Minor','Waiting','Pending','2026-10-22'],
  ['Mobile App','Layout issue on smaller screens','Complaint','Major','Execution','In progress','2026-10-11'],
  ['User Management','Add a read-only permission','Change Request','Medium','Waiting','Pending','2026-10-24'],
  ['Work Orders','Attachment preview is missing','Bug Report','Minor','Execution','Done','2026-10-06'],
  ['Inventory','Search does not match item codes','Bug Report','Medium','Execution','Done','2026-10-07'],
  ['Dashboard','Show overdue orders in overview','Change Request','Minor','Waiting','Pending','2026-10-20'],
] as const;
export const demoItems: FeedbackItem[] = Array.from({length:48},(_,i) => {
  const row = examples[i % examples.length];
  return { id:`demo-${i}`, customer_id:demoCustomers[Math.floor(i/12)].id, number:i%12+1, feature:row[0], feedback:row[1], type:row[2], category:row[3], status:row[4], activity:row[5], estimated_date:row[6], detail:'Reported during the latest customer review. The team has reproduced the issue and is reviewing the next steps.', notes:row[5]==='Done'?'Resolved and verified with the customer.':'Assigned to the product team for review.', completion_date:row[5]==='Done'?'2026-10-07':null, deleted_at:null, updated_at:'2026-10-12T07:30:00Z', actor:'Hasan Waulat' };
});
export const demoHistory: HistoryEntry[] = demoItems.slice(0,5).map((item,i)=>({id:`history-${i}`,customer_id:item.customer_id,item_id:item.id,action:i===0?'Updated feedback':i===1?'Imported feedback':'Created feedback',field:'activity',old_value:'Pending',new_value:item.activity,actor:i%2?'Sarah Chen':'Hasan Waulat',created_at:`2026-10-12T0${8-i}:20:00Z`}));