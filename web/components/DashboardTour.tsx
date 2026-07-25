'use client'

import { useEffect, useCallback } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface Props {
  accent: string
  onClose: () => void
}

export default function DashboardTour({ accent, onClose }: Props) {
  const start = useCallback(() => {
    const d = driver({
      showProgress:    true,
      progressText:    'Paso {{current}} de {{total}}',
      nextBtnText:     'Siguiente →',
      prevBtnText:     '← Atrás',
      doneBtnText:     '¡Listo!',
      animate:         true,
      smoothScroll:    true,
      allowClose:      true,
      overlayOpacity:  0.55,
      stagePadding:    8,
      stageRadius:     12,
      popoverClass:    'eo-tour-popover',
      onDestroyed:     onClose,
      steps: [
        {
          element:  '#tour-sidebar',
          popover: {
            title:       '👋 Bienvenido al dashboard',
            description: 'Este es el panel de operaciones de EasyOrder. Desde aquí gestionas todo tu restaurante. Te mostramos las secciones principales en menos de 2 minutos.',
            side:        'right',
            align:       'start',
          },
        },
        {
          element:  '#tour-nav-pedidos',
          popover: {
            title:       '◈ Pedidos',
            description: 'Aquí ves todos los pedidos del día en tiempo real: pendientes, en preparación y entregados. Es la pantalla principal de operación.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-metricas',
          popover: {
            title:       '▦ Métricas',
            description: 'Consulta el rendimiento de tu negocio: ventas, pedidos por día, productos más vendidos y comparativas por período.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-menu',
          popover: {
            title:       '≡ Menú',
            description: 'Crea y edita las categorías, productos, precios y fotos de tu carta digital. Los cambios se reflejan al instante en el enlace público de tu restaurante.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-clientes',
          popover: {
            title:       '⊙ Clientes',
            description: 'Consulta el historial de clientes: sus pedidos anteriores, datos de contacto y frecuencia de compra.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-configuracion',
          popover: {
            title:       '⚙ Configuración',
            description: 'Ajusta los datos de tu restaurante: horarios de atención, zonas de delivery, costo de envío, métodos de pago y apariencia del menú público.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-escalaciones',
          popover: {
            title:       '⚑ Derivados',
            description: 'Pedidos o consultas que fueron escalados a atención humana. Desde aquí puedes hacer seguimiento y resolverlos.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-equipo',
          popover: {
            title:       '⊞ Equipo — Cómo invitar a alguien',
            description: '<b>Paso 1:</b> Selecciona el rol (Personal, Gerente o Propietario) y haz clic en <b>Generar enlace</b>.<br><br><b>Paso 2:</b> Copia el enlace y envíalo por WhatsApp o email. Es válido 7 días.<br><br><b>Paso 3:</b> La persona abre el enlace, crea su cuenta con email y contraseña.<br><br><b>Paso 4:</b> Queda agregada automáticamente al equipo con el rol que asignaste.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-nav-perfil',
          popover: {
            title:       '👤 Mi perfil',
            description: 'Aquí puedes cambiar tu contraseña de acceso al dashboard.',
            side:        'right',
            align:       'center',
          },
        },
        {
          element:  '#tour-menu-publico',
          popover: {
            title:       '🔗 Tu menú público',
            description: 'Este enlace abre el menú digital que ven tus clientes. Puedes compartirlo por WhatsApp, redes sociales, Google Maps o imprimirlo como código QR.',
            side:        'top',
            align:       'center',
          },
        },
        {
          element:  '#tour-help-btn',
          popover: {
            title:       '¿Tienes dudas?',
            description: 'Puedes volver a ver este tour en cualquier momento haciendo clic en este botón.',
            side:        'left',
            align:       'center',
          },
        },
      ],
    })

    d.drive()
  }, [onClose])

  useEffect(() => {
    // Inyectar estilos personalizados con el color del restaurante
    const style = document.createElement('style')
    style.id = 'eo-tour-styles'
    style.textContent = `
      .eo-tour-popover .driver-popover-title {
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        margin-bottom: 6px;
      }
      .eo-tour-popover .driver-popover-description {
        font-size: 13px;
        color: #4B5563;
        line-height: 1.55;
      }
      .eo-tour-popover .driver-popover-footer button {
        background-color: ${accent} !important;
        border-color: ${accent} !important;
        border-radius: 8px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        padding: 5px 14px !important;
      }
      .eo-tour-popover .driver-popover-footer .driver-popover-prev-btn {
        background-color: transparent !important;
        border-color: #D1D5DB !important;
        color: #374151 !important;
      }
      .eo-tour-popover .driver-popover-progress-text {
        font-size: 11px;
        color: #9CA3AF;
      }
      .eo-tour-popover {
        border-radius: 14px !important;
        box-shadow: 0 20px 60px rgba(0,0,0,0.18) !important;
        min-width: 280px !important;
        max-width: 340px !important;
      }
      .driver-overlay {
        background: rgba(0,0,0,0.55) !important;
      }
    `
    document.head.appendChild(style)
    start()

    return () => {
      document.getElementById('eo-tour-styles')?.remove()
    }
  }, [start, accent])

  return null
}
