const Reservation = require('../model/reservationSchema');
const Table = require('../model/tableSchema');
const moment = require('moment');

async function cleanExpiredReservations() {
    try {
        const now = moment();
        const reservations = await Reservation.find({ status: { $in: ['confirmed','pending'] } });
        for (const res of reservations) {
            const resDate = moment(res.reservationDate).format('YYYY-MM-DD');
            const slotEnd = res.timeSlot?.split(' - ')[1]?.split(':')[0];
            const endHour = slotEnd ? parseInt(slotEnd) : 23;
            const slotEndMoment = moment(`${resDate} ${String(endHour).padStart(2,'0')}:00`, 'YYYY-MM-DD HH:mm');
            if (now.isAfter(slotEndMoment)) {
                await Reservation.findByIdAndUpdate(res._id, { status: 'completed' });
                const table = await Table.findById(res.table);
                if (table && table.status === 'reserved') {
                    await Table.findByIdAndUpdate(res.table, { status: 'available' });
                }
            }
        }
        console.log('[ReservationCleaner] Check complete');
    } catch (err) {
        console.error('[ReservationCleaner] Error:', err.message);
    }
}
module.exports = cleanExpiredReservations;
