 
    const el = (id)=>document.getElementById(id);
    const state = { unit:"C", place:null, tz:"auto" };

    const weatherMap = new Map([
      [0, "Clear sky"],[1, "Mainly clear"],[2, "Partly cloudy"],[3, "Overcast"],
      [45, "Fog"],[48, "Depositing rime fog"],[51, "Drizzle: light"],[53, "Drizzle: moderate"],[55, "Drizzle: dense"],
      [56, "Freezing drizzle: light"],[57, "Freezing drizzle: dense"],[61, "Rain: slight"],[63, "Rain: moderate"],[65, "Rain: heavy"],
      [66, "Freezing rain: light"],[67, "Freezing rain: heavy"],[71, "Snow fall: slight"],[73, "Snow fall: moderate"],[75, "Snow fall: heavy"],
      [77, "Snow grains"],[80, "Rain showers: slight"],[81, "Rain showers: moderate"],[82, "Rain showers: violent"],
      [85, "Snow showers: slight"],[86, "Snow showers: heavy"],[95, "Thunderstorm"],[96, "Thunderstorm with hail"],[99, "Thunderstorm with heavy hail"]
    ]);

    const wmoIcon = (code)=>{
      // Simple emoji icons – replace with SVGs if you like
      if ([0,1].includes(code)) return "☀️";
      if (code===2) return "⛅";
      if ([3,45,48].includes(code)) return "☁️";
      if ([51,53,55,61,63,65,80,81,82].includes(code)) return "🌧️";
      if ([66,67].includes(code)) return "🌧️🧊";
      if ([71,73,75,77,85,86].includes(code)) return "🌨️";
      if ([95,96,99].includes(code)) return "⛈️";
      return "🌡️";
    };

    // Helpers
    const toF = c => (c*9/5)+32;
    const formatTemp = c => state.unit === "C" ? `${Math.round(c)}°C` : `${Math.round(toF(c))}°F`;
    const round = n => Math.round(n);

    const setLoading = (on)=>{
      document.body.classList.toggle('loading', !!on);
    };

    const saveRecent = (label, lat, lon)=>{
      const item = {label, lat, lon, t: Date.now()};
      const arr = JSON.parse(localStorage.getItem('recent_places')||'[]');
      const filtered = arr.filter(x=>x.label.toLowerCase()!==label.toLowerCase());
      filtered.unshift(item);
      localStorage.setItem('recent_places', JSON.stringify(filtered.slice(0,8)));
      renderRecent();
    };

    const renderRecent = ()=>{
      const wrap = el('recent');
      wrap.innerHTML='';
      const arr = JSON.parse(localStorage.getItem('recent_places')||'[]');
      if(!arr.length){wrap.innerHTML = '<span class="muted">No recent places yet.</span>'; return}
      arr.forEach(({label,lat,lon})=>{
        const c = document.createElement('button');
        c.className='chip';
        c.textContent=label;
        c.onclick=()=>loadByCoords(lat,lon,label);
        wrap.appendChild(c);
      })
    };

    el('clearRecent').onclick=()=>{localStorage.removeItem('recent_places');renderRecent();};

    async function geocode(query){
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
      const r = await fetch(url);
      if(!r.ok) throw new Error('geocode failed');
      const d = await r.json();
      if(!d.results || !d.results.length) throw new Error('not found');
      const {name, country, latitude, longitude, timezone} = d.results[0];
      return {label:`${name}, ${country}`, lat:latitude, lon:longitude, tz:timezone};
    }

    async function fetchForecast(lat, lon, tz){
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lat);
      url.searchParams.set('longitude', lon);
      url.searchParams.set('timezone', tz || 'auto');
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m');
      url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum');
      url.searchParams.set('forecast_days','7');
      const r = await fetch(url);
      if(!r.ok) throw new Error('forecast failed');
      return r.json();
    }

    function formatLocal(dtISO, tz){
      try{
        return new Intl.DateTimeFormat(undefined,{weekday:'short', hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short', timeZone: tz||undefined}).format(new Date(dtISO));
      }catch{ return new Date(dtISO).toLocaleString(); }
    }

    function renderCurrent(data, label){
      const { current, timezone } = data;
      state.tz = timezone;
      el('place').textContent = label;
      el('time').textContent = formatLocal(current.time, timezone);
      el('temp').textContent = formatTemp(current.temperature_2m);
      el('feel').textContent = formatTemp(current.apparent_temperature);
      el('hum').textContent = `${round(current.relative_humidity_2m)}%`;
      el('wind').textContent = `${round(current.wind_speed_10m)} km/h`;
      const code = current.weather_code;
      el('summary').textContent = `${wmoIcon(code)} ${weatherMap.get(code) || '—'}`;
      el('desc').textContent = `Precipitation: ${current.precipitation ?? 0} mm · Wind dir: ${round(current.wind_direction_10m)}°`;
    }

    function renderForecast(data){
      const { daily } = data;
      const root = el('forecast');
      root.innerHTML='';
      for(let i=0;i<daily.time.length;i++){
        const date = new Date(daily.time[i]);
        const code = daily.weather_code[i];
        const hi = daily.temperature_2m_max[i];
        const lo = daily.temperature_2m_min[i];
        const elDay = document.createElement('div');
        elDay.className='day';
        elDay.innerHTML = `
          <div class="d">${date.toLocaleDateString(undefined,{weekday:'short', day:'numeric'})}</div>
          <div style="font-size:28px">${wmoIcon(code)}</div>
          <div class="muted">${weatherMap.get(code) || ''}</div>
          <div class="t">${formatTemp(lo)} / ${formatTemp(hi)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">💧 ${Math.round(daily.precipitation_sum[i]||0)} mm</div>
        `;
        root.appendChild(elDay);
      }
    }

    async function loadByCoords(lat, lon, label){
      try{
        setLoading(true); el('err').classList.remove('show');
        const data = await fetchForecast(lat, lon);
        renderCurrent(data, label);
        renderForecast(data);
        state.place = {label, lat, lon};
        saveRecent(label, lat, lon);
      }catch(e){
        console.error(e); el('err').classList.add('show');
      }finally{ setLoading(false); }
    }

    async function search(){
      const q = el('q').value.trim();
      if(!q) return;
      try{
        setLoading(true); el('err').classList.remove('show');
        const g = await geocode(q);
        await loadByCoords(g.lat, g.lon, g.label);
      }catch(e){
        console.error(e); el('err').classList.add('show');
      }finally{ setLoading(false); }
    }

    el('search').onclick = search;
    el('q').addEventListener('keydown', e=>{ if(e.key==='Enter') search(); });

    el('unit').onclick = ()=>{
      state.unit = state.unit==='C' ? 'F' : 'C';
      el('unit').textContent = `°${state.unit}`;
      // re-render temps if we have data
      if(state.place){ loadByCoords(state.place.lat, state.place.lon, state.place.label); }
    }

    el('geo').onclick = ()=>{
      if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
      navigator.geolocation.getCurrentPosition(async pos=>{
        const {latitude:lat, longitude:lon} = pos.coords;
        try{
          setLoading(true); el('err').classList.remove('show');
          // Reverse geocode to get a nice label
          const rev = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`)
            .then(r=>r.json()).catch(()=>null);
          const label = rev?.results?.[0] ? `${rev.results[0].name}, ${rev.results[0].country}` : 'My location';
          await loadByCoords(lat, lon, label);
        }catch(e){ console.error(e); el('err').classList.add('show'); }
        finally{ setLoading(false); }
      }, err=>{ alert('Could not get your location.'); console.warn(err); });
    };

    // Boot: try last place or a default
    renderRecent();
    (async ()=>{
      const arr = JSON.parse(localStorage.getItem('recent_places')||'[]');
      if(arr[0]){ loadByCoords(arr[0].lat, arr[0].lon, arr[0].label); }
      else{ loadByCoords(28.6139,77.2090,'New Delhi, India'); }
    })();
