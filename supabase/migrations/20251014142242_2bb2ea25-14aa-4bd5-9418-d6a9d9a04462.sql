-- Create table to store tea machine persistent state
CREATE TABLE IF NOT EXISTS public.tea_machine_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  leaf_cumulative_ms INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tea_machine_state ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own tea machine state" 
ON public.tea_machine_state 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tea machine state" 
ON public.tea_machine_state 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tea machine state" 
ON public.tea_machine_state 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_tea_machine_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_tea_machine_state_timestamp
BEFORE UPDATE ON public.tea_machine_state
FOR EACH ROW
EXECUTE FUNCTION public.update_tea_machine_state_updated_at();