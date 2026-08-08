# ABOUTME: Annullare il punteggio di una partita knockout deve disfare la propagazione a valle
# ABOUTME: Categoria debugging: tabellone a eliminazione diretta, propagazione bidirezionale

# Problem

`clearScore` su una partita di tabellone azzera il risultato ma non tocca ciò che `propagateKnockout` aveva già scritto nei turni successivi. Annullando una semifinale, il vincitore resta in `team_a`/`team_b` della finale (e il perdente nella finalina 3°/4°): il tabellone mostra squadre non qualificate.

# Solution

`clearScore`, quando la partita è knockout, calcola l'inverso di `propagateKnockout` (`propagatedDependents`) e azzera SOLO le colonne dei dipendenti che aveva scritto, e SOLO se quei dipendenti non hanno ancora un risultato:

- se un dipendente ha già punteggi → l'annullamento è RIFIUTATO con "Annulla prima il risultato della partita successiva" (niente cascata silenziosa);
- una colonna viene azzerata solo se contiene una delle due squadre della partita annullata (se contiene una squadra estranea non l'abbiamo propagata noi);
- nessuna cascata oltre il primo livello.

Attenzione ai DUE canali di propagazione quando `rounds >= 2`: la finale (vincitore) E la finalina 3°/4° (perdente). Il clear deve disfarli entrambi.

# Why It Works

Ogni propagazione in avanti ha un inverso esplicito e limitato al primo livello di dipendenti non ancora giocati. Il rifiuto quando il dipendente ha già un risultato evita cancellazioni a cascata che l'utente non ha chiesto, mantenendo l'integrità del tabellone senza sorprese. Repro scritto come test rosso PRIMA del fix (4/5 casi rossi) per garantire che il fix colpisca il bug reale.
