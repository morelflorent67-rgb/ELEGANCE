export {
  declareAbsence,
  deleteAbsence,
  listAbsences,
  type AbsenceInput,
  type ManagedAbsence,
} from "./manage";
export {
  countAppointmentsToHandle,
  listAppointmentsToHandle,
  listFreeColleagues,
  needsHold,
  needsHoldAny,
  type AppointmentToHandle,
  type FreeColleague,
  type HandleReason,
} from "./to-handle";
export { listHeldEmails, releaseHeldEmails, type HeldEmail } from "./held-emails";
