import portraitPlate from '../assets/images/sgx_plate_portrait_1795402200933.jpg';
import streetPlate from '../assets/images/sgx_plate_street_1795402200863.jpg';
import architecturePlate from '../assets/images/sgx_plate_architecture_1795402201356.jpg';

export interface StudioPlate {
  id: string;
  label: string;
  location: string;
  src: string;
}

export const STUDIO_PLATES: StudioPlate[] = [
  {
    id: 'portrait',
    label: 'Taller XR',
    location: 'Retrato de estudio · 35mm',
    src: portraitPlate,
  },
  {
    id: 'street',
    label: 'Viejo San Juan',
    location: 'Crepúsculo urbano · Anamórfico',
    src: streetPlate,
  },
  {
    id: 'architecture',
    label: 'Atrio Brutalista',
    location: 'Arquitectura · Hora dorada',
    src: architecturePlate,
  },
];

export interface SgxTintSwatch {
  id: string;
  label: string;
  pillar: string;
  hex: string;
}

export const SGX_TINT_SWATCHES: SgxTintSwatch[] = [
  { id: 'yellow', label: 'Amarillo SGX', pillar: 'SGX.Stage', hex: '#FDCC0D' },
  { id: 'cyan', label: 'Cian Telemetría', pillar: 'SGX.Showcase', hex: '#00DDFF' },
  { id: 'blue', label: 'Azul Metálico', pillar: 'SGX.Story', hex: '#32527B' },
  { id: 'orange', label: 'Cobre Spark', pillar: 'SGX.Spark', hex: '#B87000' },
  { id: 'amber', label: 'Ámbar Alerta', pillar: 'Alerta', hex: '#FFBB00' },
  { id: 'white', label: 'Síntesis Neutro', pillar: 'SGX.Synthesize', hex: '#FFFFFF' },
];
