import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Provider {
  id: string;
  name: string;
  ratePerClass: number;
  description?: string;
  location?: string;
  dayOfWeek?: string[];
  time?: string;
  color?: string;
  icon?: string;
}

interface AttendanceRecord {
  id: string;
  childId: string;
  providerId: string;
  classDate: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  loggedBy: string;
}

interface StatementData {
  childName: string;
  month: string;
  year: string;
  providers: Provider[];
  attendanceRecords: AttendanceRecord[];
  familyName?: string;
}

export function generateMonthlyStatement(data: StatementData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  // Header
  doc.setFillColor(99, 102, 241); // Indigo
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('🎯 Family Growth System', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Monthly Attendance Statement', pageWidth / 2, 28, { align: 'center' });
  
  // Child & Period Info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Child: ${data.childName}`, 14, 55);
  doc.text(`Period: ${data.month} ${data.year}`, 14, 63);
  
  if (data.familyName) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Family: ${data.familyName}`, 14, 71);
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 14, 55, { align: 'right' });
  
  let currentY = data.familyName ? 80 : 75;
  
  // Summary Section
  doc.setFillColor(249, 250, 251);
  doc.rect(14, currentY, pageWidth - 28, 35, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.rect(14, currentY, pageWidth - 28, 35, 'S');
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('📊 Monthly Summary', 20, currentY + 10);
  
  const totalRecords = data.attendanceRecords.length;
  const totalAttended = data.attendanceRecords.filter(r => r.status === 'present').length;
  const totalMissed = totalRecords - totalAttended;
  const totalCost = data.attendanceRecords.reduce((sum, record) => {
    if (record.status === 'present') {
      const provider = data.providers.find(p => p.id === record.providerId);
      return sum + (provider?.ratePerClass || 0);
    }
    return sum;
  }, 0);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Classes Scheduled: ${totalRecords}`, 20, currentY + 20);
  doc.text(`Classes Attended: ${totalAttended}`, 20, currentY + 28);
  doc.setTextColor(239, 68, 68);
  doc.text(`Classes Missed: ${totalMissed}`, 100, currentY + 20);
  doc.setTextColor(34, 197, 94);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Amount: $${totalCost.toFixed(2)}`, 100, currentY + 28);
  
  currentY += 45;
  
  // Activity Breakdown
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('📋 Activity Breakdown', 14, currentY);
  
  currentY += 5;
  
  // Generate table for each provider
  data.providers.forEach((provider, index) => {
    const providerRecords = data.attendanceRecords.filter(r => r.providerId === provider.id);
    
    if (providerRecords.length === 0) return;
    
    const attended = providerRecords.filter(r => r.status === 'present').length;
    const missed = providerRecords.length - attended;
    const cost = attended * provider.ratePerClass;
    
    // Provider header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    
    if (currentY > pageHeight - 60) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.text(`${provider.icon || '📍'} ${provider.name}`, 14, currentY + 10);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    
    let detailsY = currentY + 16;
    if (provider.location) {
      doc.text(`📍 ${provider.location}`, 14, detailsY);
      detailsY += 5;
    }
    if (provider.time) {
      doc.text(`🕐 ${provider.time}`, 14, detailsY);
      detailsY += 5;
    }
    if (provider.dayOfWeek && provider.dayOfWeek.length > 0) {
      doc.text(`📅 ${provider.dayOfWeek.join(', ')}`, 14, detailsY);
      detailsY += 5;
    }
    doc.text(`💵 $${provider.ratePerClass} per class`, 14, detailsY);
    
    currentY = detailsY + 5;
    
    // Attendance table
    const tableData = providerRecords.map(record => [
      (() => {
        // Parse date string without timezone conversion
        const [year, month, day] = record.classDate.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
      })(),
      record.status === 'present' ? '✓ Attended' : '✗ Missed',
      record.status === 'present' ? `$${provider.ratePerClass.toFixed(2)}` : '$0.00'
    ]);
    
    // Add summary row
    tableData.push([
      'TOTAL',
      `${attended} attended, ${missed} missed`,
      `$${cost.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Status', 'Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 70 },
        2: { cellWidth: 'auto', halign: 'right' }
      },
      didParseCell: (data) => {
        // Highlight last row (total)
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fillColor = [243, 244, 246];
          data.cell.styles.fontStyle = 'bold';
        }
        // Color status column
        if (data.column.index === 1 && data.row.index < tableData.length - 1) {
          const cellText = data.cell.text[0];
          if (cellText.includes('Attended')) {
            data.cell.styles.textColor = [34, 197, 94]; // Green
          } else if (cellText.includes('Missed')) {
            data.cell.styles.textColor = [239, 68, 68]; // Red
          }
        }
      }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 10;
  });
  
  // Footer with total
  if (currentY > pageHeight - 50) {
    doc.addPage();
    currentY = 20;
  }
  
  doc.setFillColor(34, 197, 94);
  doc.rect(14, currentY, pageWidth - 28, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL', 20, currentY + 10);
  doc.text(`$${totalCost.toFixed(2)}`, pageWidth - 20, currentY + 10, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${totalAttended} classes attended in ${data.month} ${data.year}`, 20, currentY + 18);
  
  // Footer note
  const footerY = pageHeight - 20;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Generated by Family Growth System - Attendance Tracking Module', pageWidth / 2, footerY, { align: 'center' });
  doc.text(`For questions or corrections, please contact your family administrator.`, pageWidth / 2, footerY + 5, { align: 'center' });
  
  return doc;
}

export function downloadMonthlyStatement(data: StatementData) {
  const doc = generateMonthlyStatement(data);
  const fileName = `${data.childName.replace(/\s+/g, '_')}_Attendance_${data.month}_${data.year}.pdf`;
  doc.save(fileName);
}

export function generateActivityStatement(
  childName: string,
  provider: Provider,
  attendanceRecords: AttendanceRecord[],
  startDate: Date,
  endDate: Date
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // Header
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${provider.icon || '📍'} ${provider.name}`, pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Activity Statement', pageWidth / 2, 25, { align: 'center' });
  
  // Details
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Student: ${childName}`, 14, 50);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 14, 58);
  doc.text(`Location: ${provider.location || 'N/A'}`, 14, 66);
  doc.text(`Schedule: ${provider.dayOfWeek?.join(', ') || 'N/A'} @ ${provider.time || 'N/A'}`, 14, 74);
  doc.text(`Rate: $${provider.ratePerClass} per class`, 14, 82);
  
  const attended = attendanceRecords.filter(r => r.status === 'present').length;
  const total = attendanceRecords.length;
  const cost = attended * provider.ratePerClass;
  
  // Table
  const tableData = attendanceRecords.map(record => [
    new Date(record.classDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    }),
    record.status === 'present' ? '✓ Present' : '✗ Absent',
    record.status === 'present' ? `$${provider.ratePerClass.toFixed(2)}` : '-'
  ]);
  
  autoTable(doc, {
    startY: 90,
    head: [['Class Date', 'Attendance', 'Charge']],
    body: tableData,
    foot: [['TOTAL', `${attended}/${total} attended`, `$${cost.toFixed(2)}`]],
    theme: 'striped',
    headStyles: {
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 11
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 45, halign: 'center' },
      2: { cellWidth: 'auto', halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.section === 'body') {
        const cellText = data.cell.text[0];
        if (cellText.includes('Present')) {
          data.cell.styles.textColor = [34, 197, 94];
          data.cell.styles.fontStyle = 'bold';
        } else if (cellText.includes('Absent')) {
          data.cell.styles.textColor = [239, 68, 68];
        }
      }
    }
  });
  
  const fileName = `${childName.replace(/\s+/g, '_')}_${provider.name.replace(/\s+/g, '_')}_Statement.pdf`;
  doc.save(fileName);
}