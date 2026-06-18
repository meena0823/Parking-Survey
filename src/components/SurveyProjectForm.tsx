import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createProject, createSlots, createRoom } from '../lib/database';
import type { SurveyProject } from '../lib/types';
import { VEHICLE_CATEGORIES } from '../lib/types';
import { ArrowLeft, Clock, Save, AlertCircle, Check, Car } from 'lucide-react';
import LocationPicker from './LocationPicker';
import {
  formatTimeLabel,
  generateSurveySlots,
  getSurveyDurationHours,
  isValidSurveyWindow,
} from '../lib/surveySlots';

interface SurveyProjectFormProps {
  onBack: () => void;
  onCreated: (project: SurveyProject) => void;
}

export default function SurveyProjectForm({ onBack, onCreated }: SurveyProjectFormProps) {
  const { teamHead } = useAuth();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Project Details
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Step 2: Survey Parameters
  const [numEnumerators, setNumEnumerators] = useState('1');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['car']);
  const [intervalMinutes, setIntervalMinutes] = useState('15');
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState('0');

  const surveyDurationHours = useMemo(
    () => (startTime && endTime ? getSurveyDurationHours(startTime, endTime) : 0),
    [startTime, endTime]
  );

  const generatedSlots = useMemo(
    () =>
      startTime && endTime && intervalMinutes
        ? generateSurveySlots(startTime, endTime, parseInt(intervalMinutes, 10), parseInt(gracePeriodMinutes, 10) || 0)
        : [],
    [startTime, endTime, intervalMinutes, gracePeriodMinutes]
  );

  // Validation helpers
  const validateStep1 = () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return false;
    }
    if (!surveyDate) {
      setError('Survey date is required');
      return false;
    }
    if (!startTime) {
      setError('Start time is required');
      return false;
    }
    if (!endTime) {
      setError('End time is required');
      return false;
    }
    if (!isValidSurveyWindow(startTime, endTime)) {
      setError('End time must be after start time');
      return false;
    }
    if (!locationName.trim()) {
      setError('Location name is required');
      return false;
    }
    if (latitude === '' || longitude === '') {
      setError('Latitude and longitude are required');
      return false;
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Latitude and longitude must be valid numbers');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!numEnumerators || parseInt(numEnumerators) < 1) {
      setError('Number of enumerators must be at least 1');
      return false;
    }
    if (selectedCategories.length === 0) {
      setError('Please select at least one vehicle category');
      return false;
    }
    if (!isValidSurveyWindow(startTime, endTime)) {
      setError('Invalid survey window. Go back and check start/end time.');
      return false;
    }
    if (!intervalMinutes || parseInt(intervalMinutes, 10) < 1) {
      setError('Sampling interval must be at least 1 minute');
      return false;
    }
    if (parseInt(gracePeriodMinutes, 10) < 0) {
      setError('Grace period cannot be negative');
      return false;
    }
    if (generatedSlots.length === 0) {
      setError('No time slots generated. Check your parameters.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handlePreviousStep = () => {
    if (step > 1) {
      setStep(step - 1);
      setError(null);
    }
  };

  const handleCategoryToggle = (categoryKey: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryKey)
        ? prev.filter(c => c !== categoryKey)
        : [...prev, categoryKey]
    );
  };

  const handleCreate = async () => {
    if (!teamHead) {
      setError('Not authenticated');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const projectData: Omit<SurveyProject, 'id' | 'room_code' | 'status' | 'created_at'> = {
        team_head_id: teamHead.id,
        project_name: projectName,
        client_name: clientName || null,
        purpose: purpose || null,
        survey_date: surveyDate,
        start_time: startTime,
        end_time: endTime,
        location_name: locationName,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        boundary_polygon: null,
        area_size_sqm: null,
        num_enumerators: parseInt(numEnumerators),
        vehicle_categories: selectedCategories,
        survey_duration_hours: surveyDurationHours,
        survey_interval_minutes: parseInt(intervalMinutes),
        grace_period_minutes: parseInt(gracePeriodMinutes, 10) || 0,
        num_slots: generatedSlots.length,
      };

      const project = await createProject(projectData);
      if (!project) {
        setError('Failed to create project');
        setIsLoading(false);
        return;
      }

      // Create slots
      if (generatedSlots.length === 0) {
        setError('No time slots could be generated. Check your survey window and interval settings.');
        setIsLoading(false);
        return;
      }

      console.log('[SurveyProjectForm] Inserting', generatedSlots.length, 'slots for project', project.id);
      const slotsData = generatedSlots.map(slot => ({
        project_id: project.id,
        slot_number: slot.slot_number,
        start_time: slot.start_time,
        end_time: slot.end_time,
        break_after_minutes: slot.break_after_minutes,
        status: 'pending' as const,
        actual_started_at: null,
        actual_completed_at: null,
        started_by: null,
        completed_by: null,
        completion_reason: null,
      }));

      const createdSlots = await createSlots(slotsData);
      console.log('[SurveyProjectForm] Slot insert result:', createdSlots.length, 'rows created');
      if (createdSlots.length === 0) {
        setError('Time slots could not be saved. Please check that all database migrations have been applied in Supabase (migration 008: break_after_minutes column).');
        setIsLoading(false);
        return;
      }

      // Create room - active immediately so enumerators can join with the room code
      await createRoom({
        project_id: project.id,
        room_code: project.room_code,
        is_active: true,
        started_at: null,
        completed_at: null,
      });

      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { number: 1, label: 'Project Details' },
    { number: 2, label: 'Survey Parameters' },
    { number: 3, label: 'Review & Create' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          <h1 className="text-2xl font-bold text-white">Create Survey Project</h1>
          <div className="w-20"></div>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((s) => (
              <div key={s.number} className="flex items-center flex-1">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm transition-all ${
                    step >= s.number
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {step > s.number ? <Check size={20} /> : s.number}
                </div>
                <div className="ml-3 flex-1">
                  <p className={`text-sm font-medium ${step >= s.number ? 'text-white' : 'text-slate-400'}`}>
                    {s.label}
                  </p>
                </div>
                {s.number < steps.length && (
                  <div className={`h-1 flex-1 mx-2 ${step > s.number ? 'bg-blue-500' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-100">{error}</p>
          </div>
        )}

        {/* Form Content */}
        <div className="bg-slate-800 rounded-lg shadow-xl overflow-hidden">
          {/* Step 1: Project Details */}
          {step === 1 && (
            <div className="p-8 space-y-6">
              <h2 className="text-xl font-bold text-white mb-6">Project Details</h2>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="e.g., Main Road Survey 2024"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="e.g., City Traffic Department"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Purpose
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                  rows={3}
                  placeholder="e.g., Traffic volume analysis for peak hours"
                />
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Survey Date *
                  </label>
                  <input
                    type="date"
                    value={surveyDate}
                    onChange={(e) => setSurveyDate(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <LocationPicker
                locationName={locationName}
                latitude={latitude}
                longitude={longitude}
                onLocationNameChange={setLocationName}
                onLatitudeChange={setLatitude}
                onLongitudeChange={setLongitude}
              />
            </div>
          )}

          {/* Step 2: Survey Parameters */}
          {step === 2 && (
            <div className="p-8 space-y-6">
              <h2 className="text-xl font-bold text-white mb-6">Survey Parameters</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Number of Enumerators *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={numEnumerators}
                    onChange={(e) => setNumEnumerators(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Survey Window
                  </label>
                  <div className="w-full bg-slate-700 text-slate-100 rounded-lg px-4 py-2 border border-slate-600">
                    {startTime && endTime ? `${startTime} - ${endTime} (${surveyDurationHours}h)` : 'Set start and end time in Step 1'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Sampling Interval (Minutes) *
                </label>
                <select
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Break Interval (Minutes)
                  <span className="ml-2 text-xs text-slate-400 font-normal">Planned pause between slots</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={gracePeriodMinutes}
                  onChange={(e) => setGracePeriodMinutes(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-3">
                  <Car size={16} className="inline mr-2" />
                  Vehicle Categories *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {VEHICLE_CATEGORIES.map(category => (
                    <button
                      key={category.key}
                      onClick={() => handleCategoryToggle(category.key)}
                      className={`p-3 rounded-lg font-medium transition-all text-left ${
                        selectedCategories.includes(category.key)
                          ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                          : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Slots Preview */}
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                  <Clock size={16} />
                  Generated Schedule Preview ({generatedSlots.length} slots)
                </h3>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                  {generatedSlots.map((slot, idx) => {
                    const breakMins = slot.break_after_minutes;
                    const hasBreak = breakMins > 0 && idx < generatedSlots.length - 1;
                    return (
                      <div key={slot.slot_number}>
                        <div className="flex items-center gap-2 bg-slate-600 px-3 py-2 rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                          <span className="text-xs font-semibold text-slate-100">Slot {slot.slot_number}</span>
                          <span className="text-xs text-slate-300 ml-auto">
                            {formatTimeLabel(slot.start_time)} – {formatTimeLabel(slot.end_time)}
                          </span>
                        </div>
                        {hasBreak && (
                          <div className="flex items-center gap-2 px-3 py-1">
                            <div className="w-px h-4 bg-amber-500/40 ml-0.5" />
                            <span className="text-[11px] text-amber-400">⏳ Break {breakMins}m</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review & Create */}
          {step === 3 && (
            <div className="p-8 space-y-6">
              <h2 className="text-xl font-bold text-white mb-6">Review & Create</h2>

              <LocationPicker
                locationName={locationName}
                latitude={latitude}
                longitude={longitude}
                onLocationNameChange={setLocationName}
                onLatitudeChange={setLatitude}
                onLongitudeChange={setLongitude}
                readOnly
              />

              {/* Summary Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Project Name</p>
                  <p className="text-lg font-bold text-white">{projectName}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Client</p>
                  <p className="text-lg font-bold text-white">{clientName || '—'}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Survey Date</p>
                  <p className="text-lg font-bold text-white">{surveyDate}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Survey Window</p>
                  <p className="text-lg font-bold text-white">{startTime} - {endTime}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Interval</p>
                  <p className="text-lg font-bold text-white">{surveyDurationHours}h / {intervalMinutes}min slots</p>
                  <p className="text-xs text-slate-300 mt-1">Break interval: {gracePeriodMinutes || 0} minutes</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Enumerators</p>
                  <p className="text-lg font-bold text-white">{numEnumerators}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Time Slots</p>
                  <p className="text-lg font-bold text-white">{generatedSlots.length}</p>
                </div>
                <div className="col-span-2 bg-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Vehicle Categories</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedCategories.map(cat => {
                      const category = VEHICLE_CATEGORIES.find(c => c.key === cat);
                      return (
                        <span key={cat} className="bg-blue-500/20 text-blue-200 text-sm px-3 py-1 rounded-full border border-blue-500/50">
                          {category?.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="bg-slate-700 px-8 py-6 flex items-center justify-between border-t border-slate-600">
            <button
              onClick={handlePreviousStep}
              disabled={step === 1}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                step === 1
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-600 text-white hover:bg-slate-500'
              }`}
            >
              <ArrowLeft size={18} />
              Previous
            </button>

            {step < 3 ? (
              <button
                onClick={handleNextStep}
                className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
              >
                Next
                <ArrowLeft size={18} className="rotate-180" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isLoading}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                  isLoading
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                <Save size={18} />
                {isLoading ? 'Creating...' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
