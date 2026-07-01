/** Static SSC rooms and room QR assets. */
export const STATIC_ROOMS = [
  '4S R&D ROOM',
  '4S SUPPORT#1',
  '4S SUPPORT#2',
  'GENTS TOILET ROOM',
  'LADIES TOILET ROOM',
  'MANAGERS ROOM',
  'PANTRY/KITCHEN',
  'PCC ROOM',
  'SAFETY OFFICE ROOM',
];

export const ROOM_QRS = {
  '4S R&D ROOM': 'assets/qrs/rooms/4S_R_D_ROOM.svg',
  '4S SUPPORT#1': 'assets/qrs/rooms/4S_SUPPORT_1.svg',
  '4S SUPPORT#2': 'assets/qrs/rooms/4S_SUPPORT_2.svg',
  'GENTS TOILET ROOM': 'assets/qrs/rooms/GENTS_TOILET_ROOM.svg',
  'LADIES TOILET ROOM': 'assets/qrs/rooms/LADIES_TOILET_ROOM.svg',
  'MANAGERS ROOM': 'assets/qrs/rooms/MANAGERS_ROOM.svg',
  'PANTRY/KITCHEN': 'assets/qrs/rooms/PANTRY_KITCHEN.svg',
  'PCC ROOM': 'assets/qrs/rooms/PCC_ROOM.svg',
  'SAFETY OFFICE ROOM': 'assets/qrs/rooms/SAFETY_OFFICE_ROOM.svg',
};

export function roomQrImagePath(room) {
  return ROOM_QRS[room] ?? null;
}
